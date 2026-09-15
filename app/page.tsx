import Link from "next/link";

const STEPS = [
  {
    title: "Tell us about your fundraiser",
    body: "Submit your organization with no account needed. EasyBookFair reviews it and, if approved, sets you up with a book fair portal.",
  },
  {
    title: "Request a fair",
    body: "Pick dates and choose what type of payment your community will use to support you — onsite cash/credit, online purchases, and/or student wallets.",
  },
  {
    title: "Run the fair",
    body: "Check out supporters and watch sales land live as your fundraiser grows.",
  },
  {
    title: "Collect your funds",
    body: "Closing the fair computes your settlement straight from actual sales — including the margin you earned — and pays it out automatically.",
  },
];

const FEATURES = [
  {
    icon: "💳",
    title: "Four ways for your community to give",
    body: "At the book fair with card/cash, a public online storefront with fair pickup, and a parent-funded student wallet — every path feeds the same fundraiser.",
  },
  {
    icon: "🎓",
    title: "Student wallets",
    body: "Parents load money onto a named student's balance ahead of time, so kids can shop — and support the fundraiser — without carrying cash. Anything left unspent becomes an extra donation to your organization.",
  },
  {
    icon: "📈",
    title: "A live sales feed",
    body: "Watch your fundraiser grow sale by sale, with a running estimate of your payout right alongside it.",
  },
  {
    icon: "💰",
    title: "Every dollar of margin, paid out automatically",
    body: "Closing a fair computes what your organization earned and pays it out to your designated account — no chasing a check.",
  },
  {
    icon: "🧑‍🏫",
    title: "Run it yourselves",
    body: "Once your fair's approved, your own staff can run checkout, pickup, wallets, and the sales feed — no EasyBookFair representative is needed at the event.",
  },
];

const AUDIENCES = [
  {
    icon: "🏫",
    title: "Schools & organizations",
    body: "Turn your book fair into real money for your school — request it, pick how your community can give, and watch the fundraiser run itself while you track every dollar.",
    href: "/join",
    linkText: "Bring EasyBookFair to your organization →",
  },
  {
    icon: "✍️",
    title: "Authors & vendors",
    body: "Submit a book or item with no account — title, description, a cover image, your price. An admin reviews it before it goes on sale anywhere.",
    href: "/author/submit",
    linkText: "Submit a book or item →",
  },
  {
    icon: "🔑",
    title: "Already set up?",
    body: "Staff and platform admins sign in with the same magic-link login — no password to remember, no separate app to install.",
    href: "/login",
    linkText: "Sign in →",
  },
];

const FAQS = [
  {
    q: "Do we need an account to get started?",
    a: "No — both joining as an organization and submitting a book start with a public form. An account only gets created once an admin approves it, and the invite email is your first sign-in.",
  },
  {
    q: "How do we actually get paid?",
    a: "Your organization keeps the margin between what a book cost and what it sold for — that's the fundraiser. Closing a fair computes your settlement, and pays what you're owed straight to your designated account; if you owe the platform instead, you get a link to pay it.",
  },
  {
    q: "Do students have to carry cash?",
    a: "Not if your school offers a student wallet — parents load money onto their kid's balance ahead of time or online, and the student spends it down at the checkout table by giving their name.",
  },
  {
    q: "Do we have to offer every payment option?",
    a: "No — you choose which of the four (card payment, online, wallet, cash) to turn on when you request the fair, and an admin can adjust them afterward if needed.",
  },
  {
    q: "Who can submit books to sell?",
    a: "Any author or vendor, through the public submission form — no account needed until an admin approves the item and it's added to the catalog. Once approved, the books or merchandise need to be shipped to EasyBookFair so they're on hand to sell at fairs.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-col">
      {/* Nav */}
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6 sm:px-12">
        <div className="font-heading text-xl font-extrabold text-primary-600 sm:text-2xl">
          📚 EasyBookFair
        </div>
        <Link href="/login" className="text-sm font-bold text-accent-600 hover:underline">
          Sign in →
        </Link>
      </div>

      {/* Hero */}
      <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-5 px-5 pb-16 pt-6 sm:px-12">
        <h1 className="max-w-2xl font-heading text-4xl font-extrabold leading-tight text-neutral-900 sm:text-5xl">
          Turn your book fair into a real fundraiser.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-neutral-600">
          EasyBookFair runs the sale for you — catalog, checkout, promotions, payout — so every
          dollar your community spends turns into money raised for your organization, not more
          work for you.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link
            href="/join"
            className="inline-flex items-center justify-center rounded-full bg-primary-500 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-600"
          >
            Bring EasyBookFair to your organization
          </Link>
          <Link
            href="/author/submit"
            className="inline-flex items-center justify-center rounded-full border-2 border-neutral-200 px-5 py-[10px] text-sm font-bold text-neutral-700 hover:border-primary-400 hover:text-primary-600"
          >
            Submit a book or item
          </Link>
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          No account needed to get started — and your organization keeps the margin on every
          sale.
        </p>
      </div>

      {/* How it works */}
      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-12">
        <h2 className="font-heading text-2xl font-extrabold text-neutral-900">How it works</h2>
        <p className="mt-1 text-sm text-neutral-500">
          From a cold start to money raised, in four steps.
        </p>
        <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex flex-col gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 font-heading text-base font-extrabold text-primary-700">
                {i + 1}
              </div>
              <h3 className="font-heading text-base font-bold text-neutral-900">{step.title}</h3>
              <p className="text-sm leading-relaxed text-neutral-600">{step.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Feature highlights */}
      <div className="mx-auto w-full max-w-5xl px-5 py-8 pb-14 sm:px-12">
        <h2 className="font-heading text-2xl font-extrabold text-neutral-900">
          Everything your fundraiser needs, built in
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          A fundraiser that keeps more money coming back to you.
        </p>
        <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col gap-2 rounded-xl2 border border-neutral-100 bg-white p-5 shadow-sm"
            >
              <div className="text-2xl">{feature.icon}</div>
              <h3 className="font-heading text-base font-bold text-neutral-900">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-neutral-600">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Who it's for */}
      <div className="mx-auto w-full max-w-5xl px-5 py-8 pb-14 sm:px-12">
        <h2 className="font-heading text-2xl font-extrabold text-neutral-900">Who it&apos;s for</h2>
        <div className="mt-7 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {AUDIENCES.map((audience) => (
            <div key={audience.title} className="flex flex-col gap-2.5">
              <h3 className="font-heading text-[17px] font-bold text-neutral-900">
                {audience.icon} {audience.title}
              </h3>
              <p className="text-sm leading-relaxed text-neutral-600">{audience.body}</p>
              <Link
                href={audience.href}
                className="text-sm font-bold text-accent-600 hover:underline"
              >
                {audience.linkText}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="mx-auto w-full max-w-3xl px-5 py-8 pb-16 sm:px-12">
        <h2 className="font-heading text-2xl font-extrabold text-neutral-900">
          Questions people ask
        </h2>
        <div className="mt-7 flex flex-col">
          {FAQS.map((faq) => (
            <div key={faq.q} className="border-b border-neutral-100 py-4">
              <p className="font-heading text-[15px] font-bold text-neutral-900">{faq.q}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mx-auto w-full max-w-5xl border-t border-neutral-100 px-5 py-8 pb-14 sm:px-12">
        <p className="text-xs text-neutral-500">
          Already running a fair, or a platform admin? See <code>docs/MANUAL.md</code> for how
          everything works and <code>docs/CHANGELOG.md</code> for what&apos;s shipped so far.
        </p>
        <Link href="/login" className="mt-2 inline-block text-xs font-bold text-accent-600 hover:underline">
          Sign in →
        </Link>
      </div>
    </main>
  );
}
