import os
import json
import base64
import requests

# 这个 url 是您通过 AutoDL 后台自定义服务获取到的地址
LOCAL_PREDICT_URL = "https://u480465-85c6-93bec7ec.westc.seetacloud.com:8443/predict"
QWEN_API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"

# 替换为您本地电脑中真实存在的图片路径
image_path = r"D:\DATA\program_data\虫害\images\black rice bug\adult\78365.jpg"

api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()

def safe_parse_json(text: str):
    raw = (text or "").strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(raw[start : end + 1])
            except Exception:
                return None
        return None

def build_system_prompt():
    return """你是一个资深的水稻病虫害专家。请给出面向农户的诊断信息。
请务必返回合法的 JSON 格式数据，不要包含 Markdown 代码块标记（如 ```json）。
JSON 结构如下：
{
  "disease_name": "病害/虫害名称（中文）",
  "scientific_name": "学名 (拉丁文，可为空)",
  "confidence": 95,
  "diagnosis": "简短的诊断结论 (50字以内)",
  "severity": "中度",
  "pathogen_info": "病原体/害虫科普信息 (100字以内)",
  "harm_level_desc": "当前危害程度描述",
  "harm_percentage": 66,
  "trend_prediction": "未来扩散趋势预测",
  "prevention_measures": [
    { "type": "化学防治", "content": "建议使用..." },
    { "type": "生物防治", "content": "引入..." },
    { "type": "农艺措施", "content": "调整..." }
  ]
}"""

def call_local_predict(img_path: str):
    with open(img_path, "rb") as image_file:
        files = {"file": (os.path.basename(img_path), image_file, "image/jpeg")}
        response = requests.post(LOCAL_PREDICT_URL, files=files, timeout=30)
        if response.status_code == 200:
            try:
                data = response.json()
            except Exception:
                data = safe_parse_json(response.text)
            label = ""
            if isinstance(data, dict) and data.get("label"):
                label = str(data.get("label", "")).strip()
            if label:
                return True, label, data, response.text
        return False, "", None, response.text

def call_qwen(payload: dict):
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    response = requests.post(QWEN_API_URL, headers=headers, json=payload, timeout=120)
    if response.status_code != 200:
        return False, None, response.text
    try:
        data = response.json()
    except Exception:
        return False, None, response.text
    try:
        content = data["choices"][0]["message"]["content"]
    except Exception:
        return False, None, data
    content = str(content or "").replace("```json", "").replace("```", "").strip()
    parsed = safe_parse_json(content)
    if parsed is None:
        return False, None, content
    return True, parsed, data

def build_payload_by_label(label: str):
    return {
        "model": "qwen3.5-plus",
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": build_system_prompt()},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "recognized_label": label,
                        "instruction": "识别结果已确定，不要再次从图像推断类别。请基于该识别结果生成面向小程序页面展示的诊断 JSON。若 label 为英文，请输出 disease_name 为中文常用名，并补充科学名与防治建议。",
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }

def build_payload_by_image(img_path: str):
    with open(img_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    data_url = "data:image/jpeg;base64," + b64
    return {
        "model": "qwen3.5-plus",
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": build_system_prompt()},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "请分析这张水稻图片。"},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ],
    }

if not os.path.exists(image_path):
    print(f"找不到图片: {image_path}")
else:
    if not api_key:
        print("缺少 DASHSCOPE_API_KEY 环境变量，无法调用 qwen3.5-plus")
        raise SystemExit(1)

    try:
        print(f"正在发送图片 {image_path}，请稍候...")
        ok, label, _, raw = call_local_predict(image_path)
        if ok:
            print("本地模型识别结果:", label)
            payload = build_payload_by_label(label)
        else:
            print("本地模型识别失败，回退到直接调用 qwen3.5-plus")
            print("本地模型返回:", raw)
            payload = build_payload_by_image(image_path)

        qok, parsed, raw_out = call_qwen(payload)
        if qok:
            print("最终结果:", parsed)
        else:
            print("qwen 调用失败:", raw_out)
    except requests.exceptions.RequestException as e:
        print("请求失败：", e)
            
