const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Update-Password"
};

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === "/api/update" && request.method === "POST") {
      if (
        !env.UPDATE_PASSWORD ||
        request.headers.get("X-Update-Password") !== env.UPDATE_PASSWORD
      ) {
        return reply({ error: "更新密码错误" }, 401);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return reply({ error: "请求格式错误" }, 400);
      }

      const allowed = [
        "ielts", "gongkao", "law",
        "finance", "sport", "intern"
      ];

      const modules = [...new Set(
        (body.modules || []).filter(x => allowed.includes(x))
      )];

      if (!modules.length) {
        return reply({ error: "没有选择有效板块" }, 400);
      }

      if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
        return reply({ error: "Worker 尚未配置 GitHub 密钥" }, 500);
      }

      const api =
        `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/daily-update.yml/dispatches`;

      const result = await fetch(api, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "BrightFuture-Workbench"
        },
        body: JSON.stringify({
          ref: "main",
          inputs: { modules: modules.join(",") }
        })
      });

      if (!result.ok) {
        return reply({
          error: `GitHub 请求失败：${result.status}`
        }, 502);
      }

      return reply({
        ok: true,
        message: "更新任务已提交",
        modules
      });
    }

    return reply({ error: "Not found" }, 404);
  }
};
