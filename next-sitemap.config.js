/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://www.smoothrizz.com',
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    additionalSitemaps: [
      'https://www.smoothrizz.com/sitemap.xml',
    ],
  },
  exclude: ['/api/*'], // Exclude API routes
  generateIndexSitemap: false, // Since site is small, we don't need index sitemap
  changefreq: 'weekly',
  priority: 0.7,
} 