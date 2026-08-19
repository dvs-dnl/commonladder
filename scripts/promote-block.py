#!/usr/bin/env python3
"""
promote-block.py — move a TASKS.md block between sections, safely.

Why this exists
---------------
Promoting a block by lifting it to an end boundary of "\n## Blocked" has destroyed an
adjacent block TWICE on this file (recorded in TASKS.md itself: cl-blog-2026-08-16 FLAG 5,
2026-08-16, and cl-verification-2026-08-17 FLAG 9, 2026-08-17). Both times the lift used a
SECTION boundary as the block's end, and swallowed whatever sat between.

The rule this script enforces: a block starts at its own "### <slug>" heading and ends at
the next "###" or "##", whichever comes first. Never at a section boundary.

It then verifies, character for character, that every block it did not intend to move is
byte-identical to the pre-edit file — and refuses to write if any is not.

Usage
-----
    python3 scripts/promote-block.py <slug> --to "Ready to deploy / publish" [--tasks PATH]
    python3 scripts/promote-block.py <slug> --to "Ready to deploy / publish" --dry-run

    --at-top      place the block first in the target section (default: first, matching
                  how Ready is ordered newest-first)
    --at-bottom   place it last in the target section instead
"""
import argparse, io, os, re, sys, shutil, datetime

BLOCK_RE   = re.compile(r'^### (\S+)', re.M)
BOUNDARY_RE = re.compile(r'^(###? )', re.M)
SECTION_RE = re.compile(r'^## (.+?)\s*$', re.M)


def blocks(text):
    """Every '### slug' block -> {slug: (start, end, body)}. End is the next ### or ##."""
    out = {}
    for m in BLOCK_RE.finditer(text):
        start = m.start()
        nxt = BOUNDARY_RE.search(text, m.end())
        end = nxt.start() if nxt else len(text)
        out[m.group(1)] = (start, end, text[start:end])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('slug')
    ap.add_argument('--to', required=True, help='target "## " section heading text')
    ap.add_argument('--tasks', default=None)
    ap.add_argument('--dry-run', action='store_true')
    g = ap.add_mutually_exclusive_group()
    g.add_argument('--at-top', action='store_true', default=True)
    g.add_argument('--at-bottom', action='store_true')
    a = ap.parse_args()

    path = a.tasks or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'TASKS.md')
    path = os.path.abspath(path)
    if not os.path.exists(path):
        sys.exit('TASKS.md not found at %s (pass --tasks)' % path)

    before = io.open(path, encoding='utf-8').read()
    b = blocks(before)
    if a.slug not in b:
        sys.exit('no "### %s" heading in %s' % (a.slug, path))

    start, end, body = b[a.slug]

    # target section
    sec = None
    for m in SECTION_RE.finditer(before):
        if m.group(1).strip() == a.to.strip():
            sec = m
            break
    if sec is None:
        sys.exit('no "## %s" section' % a.to)

    rest = before[:start] + before[end:]          # block lifted, nothing else touched

    # re-find the section in the lifted text
    sec2 = None
    for m in SECTION_RE.finditer(rest):
        if m.group(1).strip() == a.to.strip():
            sec2 = m
            break
    if sec2 is None:
        sys.exit('target section vanished after lift — aborting')

    if a.at_bottom:
        nxt = SECTION_RE.search(rest, sec2.end())
        ins = nxt.start() if nxt else len(rest)
    else:
        nb = BOUNDARY_RE.search(rest, sec2.end())
        nxt = SECTION_RE.search(rest, sec2.end())
        ins = min(x.start() for x in (nb, nxt) if x) if (nb or nxt) else len(rest)

    payload = body if body.endswith('\n\n') else body.rstrip('\n') + '\n\n'
    after = rest[:ins] + payload + rest[ins:]

    # ---- verification: every OTHER block must be byte-identical ----
    b2 = blocks(after)
    problems = []
    for slug, (_, _, old_body) in b.items():
        if slug == a.slug:
            continue
        if slug not in b2:
            problems.append('LOST: ### %s' % slug)
        elif b2[slug][2] != old_body:
            problems.append('CHANGED: ### %s (%d -> %d chars)' % (slug, len(old_body), len(b2[slug][2])))
    for slug in b2:
        if slug not in b:
            problems.append('APPEARED: ### %s' % slug)
    if b2.get(a.slug, (0, 0, ''))[2].rstrip('\n') != body.rstrip('\n'):
        problems.append('CHANGED: the moved block ### %s is not identical' % a.slug)

    print('blocks before: %d   after: %d' % (len(b), len(b2)))
    if problems:
        print('\nREFUSING TO WRITE — %d problem(s):' % len(problems))
        for p in problems:
            print('  ' + p)
        sys.exit(1)
    print('verified: all %d other blocks byte-identical; moved block byte-identical' % (len(b) - 1))

    if a.dry_run:
        print('dry run — nothing written')
        return

    bak = path + '.bak-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    shutil.copy2(path, bak)
    io.open(path, 'w', encoding='utf-8').write(after)
    print('moved "### %s" -> "## %s"' % (a.slug, a.to))
    print('backup: %s' % bak)


if __name__ == '__main__':
    main()
