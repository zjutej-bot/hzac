import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // 重点：添加下面这两行，内容就是你的仓库名 'hzac'
  basePath: '/hzac',
  assetPrefix: '/hzac',
}

export default nextConfig