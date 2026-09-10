/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Default is 1mb, which most phone photos exceed outright — the
      // "Add item" image upload goes through a Server Action, so this
      // needs raising or any upload above ~1mb fails before it even
      // reaches our code (surfacing as a generic client-side exception,
      // not the "Image upload failed" message from actions.ts).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
