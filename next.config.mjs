/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['nodemailer', 'puppeteer'],
}

export default nextConfig
