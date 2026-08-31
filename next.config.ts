import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // TMDB serves every poster and still from this host. Scoped to the exact
    // pathname prefix rather than the whole domain.
    remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" }],
  },
};

export default nextConfig;
