import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import BinarySearch from './BinarySearch.tsx';
import BloomAdd from './BloomAdd.tsx';
import BloomFilter from './BloomFilter.tsx';
import BloomStranger from './BloomStranger.tsx';
import CachePolicy from './CachePolicy.tsx';
import ConsistentHash from './ConsistentHash.tsx';
import CssSpecificity from './CssSpecificity.tsx';
import HashModulo from './HashModulo.tsx';
import HashRing from './HashRing.tsx';
import HttpConcurrency from './HttpConcurrency.tsx';
import RateLimiter from './RateLimiter.tsx';
import RetryBackoff from './RetryBackoff.tsx';
import SqlErd from './SqlErd.tsx';
import UtcWeek from './UtcWeek.tsx';

// One test per widget for the interaction it exists to teach. The models have their own tests.
describe('UtcWeek', () => {
  it('files Monday 00:30 in Johannesburg under the previous week, then moves with a preset', async () => {
    render(<UtcWeek />);
    expect(screen.getByTestId('week-label')).toHaveTextContent('Mon 14 Sep to Sun 20 Sep');
    await userEvent.click(screen.getByRole('button', { name: 'New Year in Auckland' }));
    expect(screen.getByTestId('week-label')).toHaveTextContent('Mon 28 Dec to Sun 3 Jan');
  });
});

describe('RetryBackoff', () => {
  it('shows the herd without jitter, and a far lower peak with it', async () => {
    render(<RetryBackoff />);
    const result = screen.getByTestId('backoff-result');
    expect(result).toHaveTextContent('100 retries at once');
    expect(screen.getByRole('status')).toHaveTextContent('lockstep');
    await userEvent.click(screen.getByRole('checkbox', { name: /Full jitter/ }));
    expect(result).not.toHaveTextContent('100 retries at once');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('bounds the longest delay with the cap', async () => {
    render(<RetryBackoff />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Retries' }), {
      target: { value: '8' },
    });
    expect(screen.getByText('retry 8: 64.0 s')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Cap each delay/ }));
    expect(screen.getByText('retry 8: 2.0 s')).toBeInTheDocument();
  });
});

// The widget takes its SQL from the concept's block, so the tests pass it the same way.
const SHOP = `
-- scenario: Shop | A customer places orders
CREATE TABLE customer (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE "order" (
  id int PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customer (id) ON DELETE CASCADE,
  note_1 text, note_2 text
);
CREATE INDEX order_by_customer ON "order" (customer_id);
-- scenario: Marketplace | Sellers, listings and order lines
CREATE TABLE customer (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE seller (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE "order" (id int PRIMARY KEY, customer_id int NOT NULL REFERENCES customer (id));
CREATE TABLE listing (id int PRIMARY KEY, seller_id int NOT NULL REFERENCES seller (id), price numeric(10, 2) NOT NULL);
CREATE TABLE line (
  order_id int NOT NULL REFERENCES "order" (id),
  listing_id int NOT NULL REFERENCES listing (id),
  PRIMARY KEY (order_id, listing_id)
);
`;

describe('SqlErd', () => {
  it('draws the tables and shows what the larger scenario adds', async () => {
    render(<SqlErd source={SHOP} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/2 tables and 1 relationships/);
    expect(screen.queryByText('NEW')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Marketplace' }));
    expect(screen.getByRole('img')).toHaveAccessibleName(/5 tables and 4 relationships/);
    expect(screen.getAllByText('NEW')).toHaveLength(3);
    expect(screen.getByText(/3 not in Shop/)).toBeInTheDocument();
  });

  it('reviews the design, and loses checks when the reader removes the foreign keys', async () => {
    render(<SqlErd source={SHOP} />);
    const health = screen.getByTestId('erd-health');
    expect(health).toHaveTextContent('5 of 6');
    expect(screen.getByRole('button', { name: /Numbered columns that repeat/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Declare the foreign keys/ }));
    expect(screen.getByRole('button', { name: /look like foreign keys but are not declared/ })).toBeInTheDocument();
    expect(health).not.toHaveTextContent('5 of 6');
  });

  it('flags foreign keys with no index when the reader drops the CREATE INDEX statements', async () => {
    render(<SqlErd source={SHOP} />);
    expect(screen.getByRole('button', { name: 'Every foreign key is indexed' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Keep the CREATE INDEX/ }));
    expect(screen.getByRole('button', { name: 'Foreign keys with no index' })).toBeInTheDocument();
  });

  it('writes the join between two tables, and follows the picks', async () => {
    render(<SqlErd source={SHOP} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Join path' }));
    expect(screen.getByTestId('erd-join')).toHaveTextContent('JOIN order ON order.customer_id = customer.id');
    await userEvent.selectOptions(screen.getByLabelText('From'), 'order');
    await userEvent.selectOptions(screen.getByLabelText('to'), 'customer');
    expect(screen.getByTestId('erd-join')).toHaveTextContent(/FROM order\s+JOIN customer ON order\.customer_id = customer\.id/);
    expect(screen.getByText(/never: every hop goes from a child/)).toBeInTheDocument();
  });

  it('shows the cascade, and the refusal once the cascade is removed', async () => {
    render(<SqlErd source={SHOP} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Delete impact' }));
    const effects = screen.getByTestId('erd-delete');
    expect(effects).toHaveTextContent('rows in order is deleted too');
    await userEvent.click(screen.getByRole('tab', { name: 'Edit the SQL' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Schema SQL' }), {
      target: { value: 'CREATE TABLE a (id int PRIMARY KEY); CREATE TABLE b (id int PRIMARY KEY, a_id int NOT NULL REFERENCES a (id));' },
    });
    await userEvent.click(screen.getByRole('tab', { name: 'Delete impact' }));
    expect(screen.getByTestId('erd-delete')).toHaveTextContent('refuses the delete');
    expect(screen.getByRole('status')).toHaveTextContent('Refused');
  });

  it('takes a click on a table as the ends of the join, alternately', async () => {
    render(<SqlErd source={SHOP} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Join path' }));
    await userEvent.click(screen.getByRole('button', { name: 'Table order' }));
    expect(screen.getByLabelText('From')).toHaveValue('order');
    await userEvent.click(screen.getByRole('button', { name: 'Table customer' }));
    expect(screen.getByLabelText('to')).toHaveValue('customer');
  });

  it('expands the diagram over the window, and closes it with Escape', async () => {
    render(<SqlErd source={SHOP} />);
    await userEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(screen.getByRole('button', { name: /Close/ })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /Close/ })).toBeNull();
  });

  it('shows a sample when the block has no SQL, and a warning for SQL with no table', () => {
    const { unmount } = render(<SqlErd source="" />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/3 tables/);
    unmount();
    render(<SqlErd source="SELECT 1;" />);
    expect(screen.getByRole('status')).toHaveTextContent('No CREATE TABLE statement found');
  });
});

describe('CachePolicy', () => {
  it("shows Belady's anomaly in the comparison, and LFU surviving a scan", async () => {
    render(<CachePolicy />);
    const table = screen.getByTestId('cache-compare');
    expect(within(table).getByText('FIFO').closest('tr')).toHaveTextContent('25%17% (worse)');
    expect(screen.getByRole('status')).toHaveTextContent('More room made FIFO worse');
    await userEvent.click(screen.getByRole('button', { name: 'A scan pushes out the hot keys' }));
    const lruRate = screen.getByTestId('cache-result').textContent;
    await userEvent.click(screen.getByRole('button', { name: 'LFU' }));
    expect(screen.getByTestId('cache-result').textContent).not.toBe(lruRate);
  });

  it('reruns on an edited trace', () => {
    render(<CachePolicy />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Request trace' }), {
      target: { value: 'a a a a' },
    });
    expect(screen.getByTestId('cache-result')).toHaveTextContent('75%');
  });
});

describe('HttpConcurrency', () => {
  it('stops improving when nothing queues, and warns that the rest is handshakes', async () => {
    render(<HttpConcurrency source="" />);
    const result = screen.getByTestId('http-result');
    expect(result).toHaveTextContent('Floor');
    await userEvent.click(screen.getByRole('button', { name: 'Unlimited connections' }));
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('cannot help');
    await userEvent.click(screen.getByRole('button', { name: /HTTP\/2/ }));
    expect(result).toHaveTextContent('Connections opened1');
  });

  it('draws the requests the concept gives it, and says what is wrong with them', () => {
    const { unmount } = render(<HttpConcurrency source={'a 100\nb 100 after=a'} />);
    expect(screen.getByTestId('http-result')).toHaveTextContent('Floor');
    expect(screen.getAllByText('b').length).toBeGreaterThan(0);
    unmount();
    render(<HttpConcurrency source={'a 100\nbroken'} />);
    expect(screen.getByText(/line 2/)).toBeInTheDocument();
  });

  it('says so when the block has only comments, instead of dividing by zero', () => {
    render(<HttpConcurrency source={'-- nothing yet'} />);
    expect(screen.getByText(/no requests/)).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});

describe('CssSpecificity', () => {
  it('lets one id beat ten classes, then lets !important beat the id', async () => {
    render(<CssSpecificity source="" />);
    const ranked = screen.getByTestId('css-ranked');
    expect(within(ranked).getAllByRole('listitem')[0]).toHaveTextContent('#status(1, 0, 0)wins');
    await userEvent.click(screen.getByRole('button', { name: '!important beats an id' }));
    expect(within(ranked).getAllByRole('listitem')[0]).toHaveTextContent('.badge(0, 1, 0) !importantwins');
  });

  it('takes rules from the concept, and flags a selector it cannot read', async () => {
    render(<CssSpecificity source={'.a | royalblue\n#b | crimson | layer=1'} />);
    const ranked = screen.getByTestId('css-ranked');
    // A layered id loses to an unlayered class.
    expect(within(ranked).getAllByRole('listitem')[0]).toHaveTextContent('.a');
    fireEvent.change(screen.getByRole('textbox', { name: 'Selector 1' }), { target: { value: 'a, b' } });
    expect(screen.getByText(/one at a time/)).toBeInTheDocument();
    expect(within(ranked).getAllByRole('listitem')).toHaveLength(1);
  });

  it('refuses data it cannot read', () => {
    render(<CssSpecificity source="just-a-selector" />);
    expect(screen.getByText(/Could not read this widget/)).toBeInTheDocument();
  });

  it('refuses an unknown flag rather than dropping it, and keeps a layer above 3', () => {
    const { unmount } = render(<CssSpecificity source={'.a | red | important'} />);
    expect(screen.getByText(/line 1: unknown flag "important"/)).toBeInTheDocument();
    unmount();
    render(<CssSpecificity source={'.a | red | layer=5\n.b | blue | layer=2'} />);
    expect(screen.getByRole('combobox', { name: 'Layer 1' })).toHaveDisplayValue('5');
    expect(within(screen.getByTestId('css-ranked')).getAllByRole('listitem')[0]).toHaveTextContent('layer 5');
    expect(screen.getByRole('checkbox', { name: '!important 2' })).not.toBeChecked();
  });
});

describe('BloomFilter', () => {
  it('answers a stranger "definitely not", and fills up when overloaded', async () => {
    render(<BloomFilter />);
    const answer = screen.getByTestId('bloom-answer');
    expect(answer).toHaveTextContent('Probably seen');
    fireEvent.change(screen.getByRole('textbox', { name: 'Key to look up' }), {
      target: { value: 'evt-999' },
    });
    expect(answer).toHaveTextContent('Definitely not seen');
    await userEvent.click(screen.getByRole('button', { name: 'Far too many keys' }));
    expect(answer).toHaveTextContent('false positive');
    expect(screen.getByTestId('bloom-result')).toHaveTextContent(/Bits set(9\d|100)%/);
  });
});

describe('RateLimiter', () => {
  it('lets a fixed window pass a double burst, and a sliding window stop it', async () => {
    render(<RateLimiter />);
    const result = screen.getByTestId('rate-result');
    expect(result).toHaveTextContent('Allowed10 of 10');
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('10 requests inside one window');
    await userEvent.click(screen.getByRole('button', { name: 'The same burst, sliding window' }));
    expect(result).toHaveTextContent('Allowed5 of 10');
    expect(screen.queryByText(/inside one window/)).toBeNull();
  });

  it('does not draw a mark per window for a far-off time, which would hang the page', () => {
    const { container } = render(<RateLimiter />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Request times' }), {
      target: { value: '0 1 2 1000000000' },
    });
    expect(container.querySelectorAll('.okfw-boundary')).toHaveLength(0);
    expect(screen.getByTestId('rate-result')).toHaveTextContent('Allowed4 of 4');
  });

  it('steps through the requests with the scrubber', async () => {
    render(<RateLimiter />);
    expect(screen.getByTestId('rate-decision')).toHaveTextContent('allowed');
    await userEvent.click(screen.getByRole('button', { name: 'Request: next' }));
    expect(screen.getByText(/2 of 10: at 920 ms/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Request: previous' }));
    expect(screen.getByText(/1 of 10: at 900 ms/)).toBeInTheDocument();
  });
});

describe('BinarySearch', () => {
  it('needs few looks with binary search and many with linear', async () => {
    render(<BinarySearch />);
    const result = screen.getByTestId('search-result');
    expect(result).toHaveTextContent('found at position 46');
    expect(result).toHaveTextContent('Comparisons5 (binary search)');
    await userEvent.click(screen.getByRole('button', { name: 'Linear search, the same list' }));
    expect(result).toHaveTextContent('Comparisons46 (linear search)');
  });

  it('says a present value is missing on an unsorted list, and warns', async () => {
    render(<BinarySearch />);
    await userEvent.click(screen.getByRole('button', { name: 'Binary search on an unsorted list' }));
    expect(screen.getByTestId('search-result')).toHaveTextContent('not found');
    expect(screen.getAllByRole('status').map((n) => n.textContent).join(' ')).toMatch(/not sorted.*linear search finds it/);
    await userEvent.click(screen.getByRole('button', { name: 'Linear' }));
    expect(screen.getByTestId('search-result')).toHaveTextContent('found at position 6');
  });
});

describe('ConsistentHash', () => {
  it('moves far fewer keys on the ring than with modulo, and evens out with virtual nodes', async () => {
    render(<ConsistentHash />);
    const result = screen.getByTestId('ring-result');
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('add virtual nodes');
    await userEvent.click(screen.getByRole('button', { name: '128 virtual nodes each' }));
    expect(screen.queryByText(/add virtual nodes/)).toBeNull();
    const moved = /hash ring(\d+)%.*hash % servers(\d+)%/.exec(result.textContent ?? '');
    expect(moved).not.toBeNull();
    expect(Number(moved![1])).toBeLessThan(Number(moved![2]) / 2);
  });
});

// The ladder rungs: each walks the reader through steps, and some ask for a prediction first.
const next = () => userEvent.click(screen.getByRole('button', { name: 'Next ▶' }));
const say = () => screen.getByTestId('step-say');

describe('BloomAdd', () => {
  it('adds keys one at a time, shows a shared bit, then answers yes and a certain no', async () => {
    render(<BloomAdd />);
    expect(say()).toHaveTextContent('Step 1 of 8');
    await next();
    expect(say()).toHaveTextContent('Add evt-1. Its three hashes give bits 11, 2 and 9');
    await next();
    await next();
    await next();
    expect(say()).toHaveTextContent('Bit 11 was already lit by evt-1');
    await next();
    expect(screen.getByTestId('bloom-add-answer')).toHaveTextContent('evt-2: probably seen (it was added)');
    await next();
    expect(screen.getByTestId('bloom-add-answer')).toHaveTextContent('definitely not seen (it was never added)');
  });

  it('lets the reader take over, and go back to the walkthrough', async () => {
    render(<BloomAdd />);
    await userEvent.click(screen.getByRole('button', { name: 'Ask about it' }));
    expect(say()).toHaveTextContent('exploring on your own');
    expect(screen.getByTestId('bloom-add-answer')).toHaveTextContent('evt-9: definitely not seen');
    await userEvent.click(screen.getByRole('button', { name: 'Back to step 1' }));
    expect(say()).toHaveTextContent('Step 1 of 8');
  });
});

describe('BloomStranger', () => {
  it('hides the outcome until the reader predicts, then explains the false positive and the false negative', async () => {
    render(<BloomStranger />);
    expect(screen.queryByTestId('stranger-bits')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Probably seen' }));
    expect(screen.getByRole('status')).toHaveTextContent('Right.');
    expect(screen.getByTestId('stranger-bits')).toHaveTextContent('lit by');
    await next();
    expect(screen.queryByRole('status')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Probably seen, as before' }));
    expect(screen.getByRole('status')).toHaveTextContent('Not quite');
    expect(screen.getByTestId('delete-result')).toHaveTextContent('false negative');
  });
});

describe('HashModulo', () => {
  it('moves most keys when a server joins, and says how many', async () => {
    render(<HashModulo />);
    expect(say()).toHaveTextContent('p1 hashes to 29, and 29 % 3 = 2, so it lives on server C');
    await next();
    await userEvent.click(screen.getByRole('button', { name: 'About 3 (a quarter)' }));
    expect(screen.getByRole('status')).toHaveTextContent('Not quite');
    expect(screen.getByRole('status')).toHaveTextContent('8 of 12 moved');
    await next();
    await userEvent.click(screen.getByRole('button', { name: '6 servers' }));
    expect(screen.getByTestId('modulo-moved')).toHaveTextContent(/Going from 3 servers to 6: \d+ of 12/);
  });
});

describe('HashRing', () => {
  it('moves only the keys in the new server arc, then evens the arcs out with virtual nodes', async () => {
    render(<HashRing />);
    await next();
    await userEvent.click(screen.getByRole('button', { name: 'About 3 (a quarter)' }));
    expect(screen.getByRole('status')).toHaveTextContent('Right. 3 of 12 moved (p2, p8, p10), and every one of them went to D');
    await next();
    expect(say()).toHaveTextContent('A 70%, B 26%, C 4%');
    await next();
    expect(say()).toHaveTextContent('A 34%, B 31%, C 35%');
  });
});
