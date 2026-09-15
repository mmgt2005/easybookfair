// Pre-written promotional copy for the org marketing toolkit
// (app/org/fairs/[fairId]/marketing). Templates only real fields already
// on the fairs row — no invented pricing, item counts, or claims about
// the fair.

type FairCopyParams = {
  fairName: string;
  startDate: string;
  endDate: string;
  storefrontUrl: string;
  walletUrl: string | null;
};

export function buildSocialPost(params: FairCopyParams): string {
  const walletLine = params.walletUrl
    ? ` Parents can also fund a student wallet online: ${params.walletUrl}`
    : "";
  return (
    `📚 ${params.fairName} is happening ${params.startDate} – ${params.endDate}! ` +
    `Shop online any time at ${params.storefrontUrl} — every purchase supports us.` +
    walletLine
  );
}

export function buildParentEmailBlurb(params: FairCopyParams): string {
  const walletParagraph = params.walletUrl
    ? `\n\nWant to skip carrying cash at the table? Fund your child's wallet online ahead of time: ${params.walletUrl}`
    : "";
  return (
    `Our ${params.fairName} runs ${params.startDate} through ${params.endDate}. ` +
    `You can browse and buy online any time at ${params.storefrontUrl} — ` +
    `every purchase helps support our organization.` +
    walletParagraph
  );
}

// A short encouraging line for the printable flyer — deliberately generic
// (no invented pricing, item counts, or goal amounts the fair doesn't
// actually have set anywhere), just a nudge that shopping here supports
// the fundraiser.
export function buildFlyerTagline(fairName: string): string {
  return `Every purchase supports ${fairName} — thank you for helping our fundraiser!`;
}
