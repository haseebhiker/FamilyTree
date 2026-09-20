import Link from "next/link";
import { ChevronIcon } from "@/components/ui";
import { AskHaseebButton } from "@/components/ask-haseeb";

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="ml-5 list-decimal space-y-1.5 text-sm text-slate-700">{children}</ol>;
}

function Tip({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{children}</p>;
}

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-slate-200 bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-900">
        <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
        {title}
      </summary>
      <div className="space-y-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-700">{children}</div>
    </details>
  );
}

const link = "font-medium text-blue-700 hover:underline";

export default function HelpPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Help &mdash; how to</h1>
        <p className="mt-1 text-sm text-slate-500">
          Simple steps for the things people ask most. Tap a heading to open it.
        </p>
        <div className="mt-3">
          <AskHaseebButton />
        </div>
        <p className="mt-1 text-xs text-slate-400">Have a question that isn&apos;t answered below? Message Haseeb directly.</p>
      </div>

      <div className="space-y-2">
        <Section title="Find your way around" defaultOpen>
          <p>The bar at the top of every page has:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <b>Me</b> &mdash; opens your own page
            </li>
            <li>
              <b>Tree</b> &mdash; the whole family, branch by branch
            </li>
            <li>
              <b>Compare</b> &mdash; how any two people are related
            </li>
            <li>
              <b>Magnifier</b> &mdash; search for anyone by name
            </li>
            <li>
              <b>Trophy</b> &mdash; who has helped the most (the <Link href="/leaderboard" className={link}>Leaderboard</Link>)
            </li>
            <li>
              <b>Question mark (?)</b> &mdash; this Help page
            </li>
            <li>
              <b>Menu (three lines)</b> &mdash; add a family member, My Submissions, Quick Edit and more
            </li>
          </ul>
        </Section>

        <Section title="See the tree">
          <Steps>
            <li>
              Tap <Link href="/tree" className={link}>Tree</Link> in the top bar.
            </li>
            <li>
              Tap the small arrow &#9656; beside a name to <b>open</b> that branch. Tap &#9662; to close it.
            </li>
            <li>
              Tap <b>Expand all</b> on the right of a name to open <b>everyone under that person</b> in one tap. It becomes{" "}
              <b>Collapse all</b>.
            </li>
            <li>Tap any name to open that person&apos;s own page.</li>
          </Steps>
          <p>
            On each line: the <b>bold blue word</b> is the name people usually use, the <b>small orange letters</b> are the
            family name, the <b>purple name in brackets</b> is the husband or wife, and the <b>grey number</b> is how many
            children they have.
          </p>
          <Tip>
            Can&apos;t find someone? Scroll to the bottom and open <b>&ldquo;Other family lines not yet connected to the main
            tree&rdquo;</b>.
          </Tip>
        </Section>

        <Section title="Find a person quickly">
          <Steps>
            <li>
              Type their name in the <b>search box</b> at the top of the <Link href="/tree" className={link}>Tree</Link> page (or
              tap the magnifier).
            </li>
            <li>Tap the right person in the list. Looking at the parents shown under each name helps when two people share a name.</li>
          </Steps>
        </Section>

        <Section title="See how two people are related (Compare)">
          <Steps>
            <li>
              Tap <Link href="/compare" className={link}>Compare</Link> in the top bar.
            </li>
            <li>
              In <b>Person A</b>, type a name and tap the right person &mdash; a green tick appears. Do the same in{" "}
              <b>Person B</b>.
            </li>
            <li>
              Tap <b>Compare</b>. Every way they are connected is listed, closest first, often with the Tamil word too.
            </li>
            <li>
              Tap <b>Expand map</b> on a result to see the whole chain, step by step.
            </li>
          </Steps>
          <Tip>
            Shortcut: on any person&apos;s page, tap <b>&ldquo;Compare relationship with someone else&hellip;&rdquo;</b> and only pick
            the second person. Your own page also shows <b>How you&apos;re related</b> to whoever you are looking at.
          </Tip>
        </Section>

        <Section title="Add a family member">
          <Steps>
            <li>
              Open the page of someone <b>close to the missing person</b> (to add a child, open the parent&apos;s page).
            </li>
            <li>
              Tap <b>Add</b>, then choose the <b>Relation</b>: Father, Mother, Son, Daughter, Brother, Sister, Husband or Wife.
            </li>
            <li>
              <b>Search first:</b> choose &ldquo;Pick someone already in the tree&rdquo; and type their name. Only if they truly
              are not there, choose &ldquo;Add a new person&rdquo; and fill in the name.
            </li>
            <li>
              Tap <b>Submit for review</b>. You will see a green message &mdash; you don&apos;t need to send it twice.
            </li>
          </Steps>
          <p>
            You can also open <Link href="/add-family-member" className={link}>Add a Family Member</Link> from the menu. Adding many
            people? Use <Link href="/quick-edit" className={link}>Quick Edit</Link> &mdash; a table where you can fill in names and
            birth years for many people, one after another.
          </p>
        </Section>

        <Section title="Edit or fix information">
          <Steps>
            <li>
              Open the person&apos;s page and tap <b>Edit</b>.
            </li>
            <li>Change what you need. Leave anything blank that you don&apos;t know.</li>
            <li>
              Tap <b>Save</b> (there is one at the top and one at the bottom).
            </li>
          </Steps>
          <p>
            <b>Date of birth:</b> type numbers in the three boxes &mdash; year, month (1&ndash;12) and day, for example
            <b> 1985 &nbsp;9 &nbsp;23</b>. Any part can be left blank.
          </p>
          <p>
            <b>Birth order:</b> 1 for the first child, 2 for the second and so on &mdash; it puts brothers and sisters in the right
            order when the exact year isn&apos;t known.
          </p>
          <Tip>
            Your change is checked before it shows for everyone. Add a short <b>Note to admin</b> (for example &ldquo;my mother told
            me&rdquo;) to help it get approved faster.
          </Tip>
        </Section>

        <Section title="Add or change a photo">
          <p>
            Only <b>you (on your own page)</b> or an admin can change a photo. Tap the small <b>camera</b> on the round photo, or
            tap <b>Edit</b> and use <b>Change photo</b>. To take a photo away, use <b>Remove photo</b> (or the small red bin on the
            photo).
          </p>
        </Section>

        <Section title="Add a phone number or email (Contact)">
          <p>
            On your own page, tap <b>Contact</b>, choose Phone, Email or Address, and tap <b>Add</b>. These are private &mdash;
            only admins can see them until you choose who else can, from{" "}
            <Link href="/privacy" className={link}>My Privacy Settings</Link> in the menu.
          </p>
        </Section>

        <Section title="Check on what I sent">
          <p>
            Open the menu &rarr; <Link href="/my-submissions" className={link}>My Submissions</Link>. Each change shows{" "}
            <b>pending</b> (waiting for an admin), <b>approved</b> or <b>rejected</b>.
          </p>
        </Section>

        <Section title="Put the tree on my phone's home screen">
          <p>
            See <Link href="/install" className={link}>Install App</Link> in the menu for step-by-step instructions for iPhone and
            Android.
          </p>
        </Section>

        <Section title="Still stuck?">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              Read the <Link href="/faq" className={link}>Frequently Asked Questions</Link>.
            </li>
            <li>
              Send a note through <Link href="/suggestions" className={link}>Suggestions</Link> in the menu &mdash; tell us what
              isn&apos;t working or what would help.
            </li>
            <li>Or message Haseeb directly:</li>
          </ul>
          <div className="pt-2">
            <AskHaseebButton />
          </div>
        </Section>
      </div>
    </div>
  );
}
