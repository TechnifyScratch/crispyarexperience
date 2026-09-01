import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Find Crispy Craig",
    short_name: "Craig Hunt",
    description: "The in-store Crispy Craig AR hunt.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5ead7",
    theme_color: "#c93a4a",
  };
}
