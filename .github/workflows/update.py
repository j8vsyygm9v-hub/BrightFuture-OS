import json
import os
import urllib.request
import xml.etree.ElementTree as ET
import hashlib
import html
from datetime import datetime, timezone, timedelta

BJ = timezone(timedelta(hours=8))
TODAY = datetime.now(BJ).strftime("%Y-%m-%d")

SELECTED = set(
    x.strip()
    for x in os.getenv("SELECTED_MODULES", "").split(",")
    if x.strip()
)

FEEDS = {
    "ielts": [
        ("BBC Learning English",
         "https://feeds.bbci.co.uk/learningenglish/english/features/6-minute-english/rss")
    ],
    "gongkao": [
        ("中国新闻网",
         "https://www.chinanews.com.cn/rss/china.xml")
    ],
    "law": [
        ("中国新闻网法治",
         "https://www.chinanews.com.cn/rss/fz.xml")
    ],
    "finance": [
        ("中国新闻网财经",
         "https://www.chinanews.com.cn/rss/finance.xml")
    ]
}

NAMES = {
    "ielts": "国际人",
    "gongkao": "治理者",
    "law": "律政人",
    "finance": "财富家",
    "sport": "竞技者",
    "intern": "职业家"
}


def get_feed(url):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "BrightFuture/1.0"}
    )

    with urllib.request.urlopen(req, timeout=25) as response:
        root = ET.fromstring(response.read())

    result = []

    for item in root.findall(".//item")[:10]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        description = (item.findtext("description") or "").strip()

        if title and link.startswith("http"):
            result.append((title, link, description))

    return result


def make_task(module, title, source, link, description=""):
    tid = hashlib.sha1(
        (module + link).encode()
    ).hexdigest()[:12]

    body = [
        {
            "type": "p",
            "html": "公开来源：" + html.escape(source)
        }
    ]

    if description:
        body.append({
            "type": "p",
            "html": html.escape(description[:800])
        })

    body.append({
        "type": "links",
        "items": [{
            "text": "查看原始内容",
            "href": link
        }]
    })

    return {
        "tid": "public_" + module + "_" + tid,
        "title": title[:120],
        "time": "自主阅读",
        "hint": "新收录内容",
        "added": TODAY,
        "body": body
    }


with open("daily.json", "r", encoding="utf-8") as f:
    data = json.load(f)

data.setdefault("modules", {})
data.setdefault("brief", [])

for module in SELECTED:

    if module not in NAMES:
        continue

    section = data["modules"].setdefault(
        module,
        {"sub": "学习内容", "tasks": []}
    )

    section.setdefault("tasks", [])

    old_ids = {
        task.get("tid")
        for task in section["tasks"]
    }

    new_tasks = []

    if module == "sport":
        new_tasks.append(
            make_task(
                module,
                "运动与健康：每周运动建议",
                "世界卫生组织",
                "https://www.who.int/news-room/fact-sheets/detail/physical-activity",
                "成年人建议每周进行150至300分钟中等强度有氧活动，并结合力量训练。"
            )
        )

    elif module == "intern":
        new_tasks.append(
            make_task(
                module,
                "央国企及实习岗位检索入口",
                "国聘招聘平台",
                "https://www.iguopin.com/",
                "检索法务、合规、律所、央国企和外企岗位。具体岗位状态请以招聘页面为准。本次不虚构具体在招岗位。"
            )
        )

    else:
        for source, url in FEEDS.get(module, []):
            try:
                for title, link, desc in get_feed(url):
                    new_tasks.append(
                        make_task(
                            module,
                            title,
                            source,
                            link,
                            desc
                        )
                    )
            except Exception as error:
                print("数据源暂不可用：", url, error)

    added = []

    for task in new_tasks:
        if task["tid"] not in old_ids:
            section["tasks"].append(task)
            old_ids.add(task["tid"])
            added.append(task)

    if module == "law" and not added:
        tid = "law_research_" + TODAY.replace("-", "")

        if tid not in old_ids:
            section["tasks"].append({
                "tid": tid,
                "title": "法学论文检索入口",
                "time": "自主阅读",
                "hint": "本次没有取得可核验的新论文元数据",
                "added": TODAY,
                "body": [
                    {
                        "type": "p",
                        "html": "本次未取得足够可靠的论文题名、作者和期刊信息，因此不编造文献。可按民事诉讼法、算法与社会、劳动法方向检索。"
                    },
                    {
                        "type": "links",
                        "items": [
                            {
                                "text": "中国知网",
                                "href": "https://www.cnki.net/"
                            },
                            {
                                "text": "国家哲学社会科学文献中心",
                                "href": "https://www.ncpssd.cn/"
                            }
                        ]
                    }
                ]
            })

    summary = (
        [t["title"] for t in added[:3]]
        if added else
        ["本次没有新增可核验内容，原有内容保留"]
    )

    found = False

    for item in data["brief"]:
        if item.get("mid") == module:
            item["items"] = summary
            found = True

    if not found:
        data["brief"].append({
            "mid": module,
            "tag": NAMES[module],
            "items": summary
        })

data["date"] = TODAY
data["v"] = 3

with open("daily.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("更新完成：", SELECTED)
