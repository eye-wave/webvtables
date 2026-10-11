declare module "*.mdx" {
  import type { Component } from "solid-js";
  const Doc: Component<{ components?: Record<string, Component<any>> }>;
  export default Doc;
}
