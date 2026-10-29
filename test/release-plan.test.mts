import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyRelease, bumpFor, nextVersion, plan, unreleasedEntries } from '../scripts/release-plan.mts';

const log = (unreleased: string) => `# Changelog\n\n## Unreleased\n${unreleased}\n## 1.2.0 - 2026-10-29\n\n- **Old.** thing\n`;

describe('release plan', () => {
  it('does not release an empty Unreleased section', () => {
    const p = plan(log(''), '1.2.0');
    assert.equal(p.release, false);
    assert.match(p.reason, /no entries/);
  });

  it('says why when runtime dependencies changed and nothing was written', () => {
    assert.match(plan(log(''), '1.2.0', true).reason, /runtime dependencies changed/);
  });

  it('reads an entry with its continuation lines, and stops at the next heading', () => {
    const entries = unreleasedEntries(log('\n- **A.** first\n  more\n- **B.** second\n'));
    assert.equal(entries.length, 2);
    assert.match(entries[0], /more/);
  });

  it('picks the bump from the markers', () => {
    assert.equal(bumpFor(['- **Breaking: x.**']), 'major');
    assert.equal(bumpFor(['- **Fix: x.**', '- **Security: y.**']), 'patch');
    assert.equal(bumpFor(['- **Fix: x.**', '- **New thing.**']), 'minor');
    assert.equal(bumpFor(['- **Fixed: x.**', '- **Breaking: y.**']), 'major');
  });

  it('increments semver', () => {
    assert.equal(nextVersion('1.2.9', 'patch'), '1.2.10');
    assert.equal(nextVersion('1.2.9', 'minor'), '1.3.0');
    assert.equal(nextVersion('1.2.9', 'major'), '2.0.0');
    assert.throws(() => nextVersion('1.2.0-beta.1', 'patch'));
  });

  it('plans a release with the next version', () => {
    const p = plan(log('\n- **Fix: a bug.** detail\n'), '1.2.0');
    assert.deepEqual([p.release, p.bump, p.next], [true, 'patch', '1.2.1']);
  });

  it('moves Unreleased under a dated heading and leaves it empty', () => {
    const out = applyRelease(log('\n- **Fix: a bug.**\n'), '1.2.1', '2026-11-01');
    assert.match(out, /## Unreleased\n\n## 1\.2\.1 - 2026-11-01\n\n- \*\*Fix: a bug\.\*\*/);
    assert.equal(unreleasedEntries(out).length, 0);
  });

  it('refuses to apply with nothing to release, or with a bad version or date', () => {
    assert.throws(() => applyRelease(log(''), '1.2.1', '2026-11-01'));
    assert.throws(() => applyRelease(log('\n- **x**\n'), '1.2.1; rm', '2026-11-01'));
    assert.throws(() => applyRelease(log('\n- **x**\n'), '1.2.1', 'today'));
  });
});
