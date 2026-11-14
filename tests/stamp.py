"""按文件内容给 sw.js 写 VERSION 和 FILES（整版缓存的清单）。推之前跑一下：python3 tests/stamp.py
文件没变，版本号就不变；变了任何一个，手机下次打开时整版换新的。"""
import hashlib, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'tests', '.github', '.claude'}
SKIP_FILES = {'sw.js', 'CLAUDE.md', 'README.md', 'CHANGELOG.md', '.nojekyll', '.gitignore'}


def files():
    out = []
    for d, dirs, fs in os.walk(ROOT):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS and not x.startswith('.'))
        for f in sorted(fs):
            rel = os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, '/')
            if rel in SKIP_FILES or f.startswith('.'):
                continue
            out.append(rel)
    return out


def stamp(write=True):
    fl = files()
    h = hashlib.sha1()
    for f in fl:
        h.update(f.encode()); h.update(open(os.path.join(ROOT, f), 'rb').read())
    ver = h.hexdigest()[:10]
    p = os.path.join(ROOT, 'sw.js')
    s = open(p, encoding='utf-8').read()
    block = "// <stamp>\nconst VERSION = '%s';\nconst FILES = [\n%s\n];\n// </stamp>" % (ver, ',\n'.join("  '%s'" % f for f in fl))
    s2 = re.sub(r'// <stamp>.*?// </stamp>', lambda m: block, s, flags=re.S)
    if write and s2 != s:
        open(p, 'w', encoding='utf-8').write(s2)
    return ver, s2 != s


if __name__ == '__main__':
    ver, changed = stamp()
    print(ver, '（更新了 sw.js）' if changed else '（没变）')
