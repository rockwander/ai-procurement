import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // @react-pdf/renderer -> pdfkit loads its standard fonts through the
  // "#standard-fonts/*" subpath import, which Next's file tracer does not
  // follow. Bundle those files (and the .afm metrics) explicitly for the
  // routes that render PDFs.
  serverExternalPackages: ['@react-pdf/renderer'],
  outputFileTracingIncludes: {
    '/api/rfqs/[id]/pdf': [
      './node_modules/pdfkit/js/standard-fonts/**/*',
      './node_modules/pdfkit/js/data/**/*',
    ],
    '/api/rfqs/[id]/award': [
      './node_modules/pdfkit/js/standard-fonts/**/*',
      './node_modules/pdfkit/js/data/**/*',
    ],
    '/api/sample-docs/[slug]': [
      './node_modules/pdfkit/js/standard-fonts/**/*',
      './node_modules/pdfkit/js/data/**/*',
    ],
  },
};

export default nextConfig;
