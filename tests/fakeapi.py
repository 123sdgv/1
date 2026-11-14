"""假接口：本地起一个 OpenAI 兼容的 /v1/chat/completions，能真的一点一点流式地回（测卡住、超时要用）。

用法（测试脚本里）：
    from fakeapi import FakeApi
    api = FakeApi(8766).start()
    api.script = lambda body: [('content', '你好'), ('finish', 'stop')]   # 每次请求怎么回
    api.calls  # 收到的请求（body 的 dict）

一步一步：('content', 字) 正文 / ('reason', 字) 思考过程 / ('keep',) 排队时的 keep-alive 注释行 /
          ('sleep', 秒) / ('hang',) 一直挂着不回（直到测试结束）/ ('finish', 原因) / ('http', 状态码, 内容)
没设 script 时用 default_script：按提示词里的关键字回一段字（塔罗、追问、聊天、日记 JSON…）。
"""
import json, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler


def text_of(body):
    return '\n'.join(str(m.get('content', '')) for m in body.get('messages', []))


def default_script(body):
    t = text_of(body)
    if '温暖但清醒的塔罗师' in t:
        txt = '【整体能量】\n牌面比较安静，像是在等一个决定。\n\n【逐张解读】\n第一张是起点，第二张是现在，第三张往前看。\n\n【综合解读】\n这一周先把手头那件小事做完。\n\n【能量总结】\n慢慢来\n\n你现在最想先放下的是哪一件？牌显示的是当下的能量，你的选择随时可以改变走向。'
        return [('content', txt[i:i + 12]) for i in range(0, len(txt), 12)] + [('finish', 'stop')]
    if '客观、理性的塔罗师' in t:
        return [('content', '这张牌在这里'), ('content', '更像是提醒你先停一下。'), ('finish', 'stop')]
    if '"diary"' in t or '写日记' in t:
        return [('content', json.dumps({'date': '', 'text': '今天聊了一会儿。', 'inner': '', 'keys': [], 'memo': []}, ensure_ascii=False)), ('finish', 'stop')]
    return [('content', '好'), ('finish', 'stop')]


class FakeApi:
    def __init__(self, port=8766):
        self.port = port
        self.script = None
        self.calls = []
        self.stop_flag = threading.Event()

    @property
    def base(self):
        return f'http://localhost:{self.port}'

    def start(self):
        api = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def cors(self):
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Headers', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

            def do_OPTIONS(self):
                self.send_response(204); self.cors(); self.end_headers()

            def do_GET(self):
                self.send_response(200); self.cors(); self.send_header('Content-Type', 'application/json'); self.end_headers()
                self.wfile.write(b'{"data":[{"id":"fake-model"}]}')

            def do_POST(self):
                n = int(self.headers.get('Content-Length') or 0)
                body = json.loads(self.rfile.read(n) or b'{}')
                api.calls.append(body)
                steps = (api.script or default_script)(body)
                http = next((s for s in steps if s[0] == 'http'), None)
                if http:
                    self.send_response(http[1]); self.cors(); self.send_header('Content-Type', 'application/json'); self.end_headers()
                    self.wfile.write(json.dumps({'error': {'message': http[2] if len(http) > 2 else 'err'}}).encode()); return
                stream = body.get('stream', True)
                try:
                    if not stream:
                        text, why = '', 'stop'
                        for s in steps:
                            if s[0] == 'content': text += s[1]
                            elif s[0] == 'sleep': time.sleep(s[1])
                            elif s[0] == 'hang': api.stop_flag.wait(); return
                            elif s[0] == 'finish': why = s[1]
                        self.send_response(200); self.cors(); self.send_header('Content-Type', 'application/json'); self.end_headers()
                        self.wfile.write(json.dumps({'choices': [{'message': {'content': text}, 'finish_reason': why}]}, ensure_ascii=False).encode()); return
                    self.send_response(200); self.cors()
                    self.send_header('Content-Type', 'text/event-stream'); self.send_header('Cache-Control', 'no-cache'); self.end_headers()
                    def ev(obj):
                        self.wfile.write(('data: ' + json.dumps(obj, ensure_ascii=False) + '\n\n').encode()); self.wfile.flush()
                    for s in steps:
                        if s[0] == 'content': ev({'choices': [{'delta': {'content': s[1]}}]}); time.sleep(0.03)
                        elif s[0] == 'reason': ev({'choices': [{'delta': {'reasoning_content': s[1]}}]}); time.sleep(0.03)
                        elif s[0] == 'keep': self.wfile.write(b': keep-alive\n\n'); self.wfile.flush()
                        elif s[0] == 'sleep': time.sleep(s[1])
                        elif s[0] == 'hang':
                            while not api.stop_flag.wait(1):
                                self.wfile.write(b': keep-alive\n\n'); self.wfile.flush()
                            return
                        elif s[0] == 'finish': ev({'choices': [{'delta': {}, 'finish_reason': s[1]}]})
                    self.wfile.write(b'data: [DONE]\n\n'); self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass

        self.srv = ThreadingHTTPServer(('127.0.0.1', self.port), H)
        self.srv.daemon_threads = True
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        return self

    def close(self):
        self.stop_flag.set()
        self.srv.shutdown(); self.srv.server_close()
