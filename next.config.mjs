/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // app listens on container port; reverse proxy in front
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  images: {
    // Next image optimizer is NOT used by the app (favicons render via plain
    // <img>), but keep the optimizer's allow-list locked down so the public
    // /_next/image endpoint can't be abused as an open proxy / SSRF.
    remotePatterns: [
      { protocol: "https", hostname: "www.google.com", pathname: "/s2/favicons*" },
      { protocol: "https", hostname: "t0.gstatic.com" },
      { protocol: "https", hostname: "t1.gstatic.com" },
      { protocol: "https", hostname: "t2.gstatic.com" },
      { protocol: "https", hostname: "t3.gstatic.com" },
    ],
  },
};

export default nextConfig;