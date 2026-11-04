const ALLOWED_MODULES = [
  "ielts",
  "gongkao",
  "law",
  "finance",
  "sport",
  "intern"
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Update-Password"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 更新接口
    if (url.pathname === "/api/update") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Update-Password"
          }
        });
      }

      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
      }

      const password = request.headers.get("X-Update-Password");

      if (!env.UPDATE_PASSWORD || password !== env.UPDATE_PASSWORD) {
        return json({ error: "密码错误" }, 401);
      }

      if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
        return json({ error: "GitHub 环境变量配置不完整" }, 500);
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json({ error: "请求数据格式错误" }, 400);
      }

      const modules = Array.isArray(body.modules)
        ? body.modules
        : typeof body.modules === "string"
          ? body.modules.split(",").map(x => x.trim()).filter(Boolean)
          : [];

      const selected = [...new Set(modules)];

      if (
        selected.length === 0 ||
        selected.some(m => !ALLOWED_MODULES.includes(m))
      ) {
        return json({ error: "更新模块选择无效" }, 400);
      }

      const apiUrl =
        `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/daily-update.yml/dispatches`;

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "BrightFuture-OS"
          },
          body: JSON.stringify({
            ref: "main",
            inputs: {
              modules: selected.join(",")
            }
          })
        });

        if (!response.ok) {
          const detail = await response.text();
          return json({
            error: "GitHub 请求失败",
            status: response.status,
            detail: detail.slice(0, 1000)
          }, 502);
        }

        return json({
          success: true,
          message: "更新任务已提交，请稍后刷新工作台。",
          modules: selected
        });
      } catch (error) {
        return json({
          error: "连接 GitHub 失败",
          detail: String(error)
        }, 502);
      }
    }

    // 其他请求交给 Cloudflare 静态资源服务
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return json({
      error: "静态资源未配置，请检查 Cloudflare Assets 绑定"
    }, 404);
  }
};
