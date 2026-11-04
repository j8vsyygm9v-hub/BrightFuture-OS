const ALLOWED_MODULES = [
  "ielts",
  "gongkao",
  "law",
  "finance",
  "sport",
  "intern"
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Update-Password",
  "Content-Type": "application/json; charset=utf-8"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 处理浏览器跨域预检
    if (request.method === "OPTIONS" && url.pathname === "/api/update") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // 更新接口
    if (url.pathname === "/api/update") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
      }

      // 检查更新密码
      const password = request.headers.get("X-Update-Password");

      if (!env.UPDATE_PASSWORD || password !== env.UPDATE_PASSWORD) {
        return json({ error: "更新密码错误或未配置" }, 401);
      }

      // 检查后台配置
      if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
        return json({ error: "GitHub 环境变量未配置完整" }, 500);
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json({ error: "请求内容不是有效 JSON" }, 400);
      }

      const modules = Array.isArray(body.modules)
        ? [...new Set(body.modules)]
        : [];

      if (
        modules.length === 0 ||
        modules.some(module => !ALLOWED_MODULES.includes(module))
      ) {
        return json({ error: "模块选择无效" }, 400);
      }

      // 触发 GitHub Actions
      const githubUrl =
        `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/daily-update.yml/dispatches`;

      let githubResponse;

      try {
        githubResponse = await fetch(githubUrl, {
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
              modules: modules.join(",")
            }
          })
        });
      } catch (error) {
        return json({
          error: "连接 GitHub 失败：" + error.message
        }, 502);
      }

      if (!githubResponse.ok) {
        const detail = await githubResponse.text();

        return json({
          error: "GitHub 拒绝了更新请求",
          status: githubResponse.status,
          detail: detail.slice(0, 1000)
        }, 502);
      }

      return json({
        success: true,
        message: "更新请求已成功提交",
        modules
      }, 200);
    }

    // 其他路径交给 Cloudflare 静态资源服务
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return json({
      error: "未找到接口或静态资源绑定 ASSETS"
    }, 404);
  }
};
