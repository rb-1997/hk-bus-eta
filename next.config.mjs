/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // PWA headers can be added via vercel.json or middleware if needed
};

export default nextConfig;