import { onRequestPost as __api_reviewer_js_onRequestPost } from "C:\\Users\\Ken\\Documents\\GitHub\\riza-reviewer\\functions\\api\\reviewer.js"

export const routes = [
    {
      routePath: "/api/reviewer",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_reviewer_js_onRequestPost],
    },
  ]