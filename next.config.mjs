import withPWA from 'next-pwa';

const withPwa = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

export default withPwa({
  experimental: { appDir: true },
});
