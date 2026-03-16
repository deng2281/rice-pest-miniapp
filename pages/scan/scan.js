const API_KEY = ''
const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const LOCAL_PREDICT_URL = 'https://u480465-85c6-93bec7ec.westc.seetacloud.com:8443/predict'

const LOCAL_PREDICT_TIMEOUT_MS = 8000
const QWEN_TEXT_TIMEOUT_MS = 25000
const QWEN_IMAGE_TIMEOUT_MS = 60000

const DEMO_IMAGE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%232af598"/><stop offset="1" stop-color="%23009efd"/></linearGradient></defs><rect width="100%" height="100%" fill="url(%23g)"/><circle cx="150" cy="150" r="70" fill="rgba(255,255,255,0.25)"/><path d="M110 150h80" stroke="white" stroke-width="8" stroke-linecap="round"/><path d="M150 110v80" stroke="white" stroke-width="8" stroke-linecap="round"/><text x="150" y="250" font-size="24" text-anchor="middle" fill="white">Rice</text></svg>'

function requestAsync(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      timeout: typeof options.timeout === 'number' ? options.timeout : 12000,
      success: resolve,
      fail: reject
    })
  })
}

function uploadFileAsync(options) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      ...options,
      success: resolve,
      fail: reject
    })
  })
}

function sleepAsync(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeRequestFailMsg(err) {
  const msg = String((err && err.errMsg) || err || '')
  if (msg.includes('url not in domain list')) {
    return '域名未配置：请添加 request 合法域名'
  }
  if (msg.includes('timeout')) {
    return '请求超时：请检查网络后重试'
  }
  if (msg.includes('ssl') || msg.includes('SSL')) {
    return 'SSL 失败：请检查网络环境'
  }
  if (msg) return msg
  return '请求失败'
}

function safeParseJson(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      const sliced = raw.slice(start, end + 1)
      try {
        return JSON.parse(sliced)
      } catch (e2) {
        return null
      }
    }
    return null
  }
}

function readFileAsBase64DataUrlAsync(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (res) => {
        resolve('data:image/jpeg;base64,' + res.data)
      },
      fail: reject
    })
  })
}

async function callDashScopeJson({ payload, timeoutMs, retries }) {
  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await requestAsync({
        url: API_URL,
        method: 'POST',
        timeout: timeoutMs,
        header: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`
        },
        data: payload
      })

      if (res.statusCode === 200 && res.data && res.data.choices && res.data.choices.length > 0) {
        let content = res.data.choices[0].message.content
        content = String(content || '').replace(/```json/g, '').replace(/```/g, '').trim()
        const parsed = safeParseJson(content)
        if (parsed) return { ok: true, data: parsed }
        lastErr = new Error('parse_fail')
      } else {
        const msg = (res.data && res.data.error && res.data.error.message) || `HTTP ${res.statusCode}`
        lastErr = new Error(msg)
      }
    } catch (e) {
      lastErr = e
    }

    if (attempt < retries) {
      await sleepAsync(500)
    }
  }
  return { ok: false, err: lastErr }
}

async function callLocalPredict({ filePath, timeoutMs }) {
  try {
    const res = await uploadFileAsync({
      url: LOCAL_PREDICT_URL,
      filePath,
      name: 'file',
      timeout: timeoutMs
    })
    const statusCode = res && typeof res.statusCode === 'number' ? res.statusCode : 0
    const parsed = safeParseJson(res && res.data)
    const label = parsed && parsed.label ? String(parsed.label).trim() : ''
    if (statusCode === 200 && label) {
      return { ok: true, label }
    }
    return { ok: false, statusCode, raw: res && res.data }
  } catch (e) {
    return { ok: false, err: e }
  }
}

function buildDiagnosisSystemPrompt() {
  return `你是一个资深的水稻病虫害专家。请给出面向农户的诊断信息。
请务必返回合法的 JSON 格式数据，不要包含 Markdown 代码块标记（如 \`\`\`json）。
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
}`
}

function buildDiagnosisPayloadByImage({ model, base64Image }) {
  return {
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildDiagnosisSystemPrompt() },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请分析这张水稻图片。' },
          { type: 'image_url', image_url: { url: base64Image } }
        ]
      }
    ]
  }
}

function buildDiagnosisPayloadByLabel({ model, label }) {
  return {
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildDiagnosisSystemPrompt() },
      {
        role: 'user',
        content: JSON.stringify({
          recognized_label: label,
          instruction:
            '识别结果已确定，不要再次从图像推断类别。请基于该识别结果生成面向小程序页面展示的诊断 JSON。若 label 为英文，请输出 disease_name 为中文常用名，并补充科学名与防治建议。'
        })
      }
    ]
  }
}

function upsertHistoryRecord(record) {
  const history = wx.getStorageSync('historyRecords') || []
  const id = record && record.id !== undefined ? String(record.id) : ''
  const idx = id ? history.findIndex((i) => String(i && i.id) === id) : -1
  const next = idx >= 0 ? [...history.slice(0, idx), record, ...history.slice(idx + 1)] : [record, ...history]
  wx.setStorageSync('historyRecords', next.slice(0, 50))
}

Page({
  data: {
    images: [],
    loading: false,
    modelName: 'qwen3.5-plus',
    allSelected: false,
    selectedCount: 0
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    if (this._resetOnShow) {
      this._resetOnShow = false
      this.resetSelection()
    }
    if (!this._autoOpened) {
      this._autoOpened = true
      this.chooseImage()
    }
  },

  resetSelection() {
    this.setData({
      images: [],
      loading: false,
      allSelected: false,
      selectedCount: 0
    })
  },

  chooseImage() {
    if (this.data.loading) return
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const nextItems = res.tempFiles.map((file) => ({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          path: file.tempFilePath,
          selected: true,
          status: 'pending',
          statusText: '待识别'
        }))
        const images = [...this.data.images, ...nextItems]
        const selectedCount = images.filter((item) => item.selected).length
        this.setData({
          images,
          selectedCount,
          allSelected: images.length > 0 && selectedCount === images.length
        })
      }
    })
  },

  toggleSelect(e) {
    const id = e.currentTarget.dataset.id
    const images = this.data.images.map((item) =>
      item.id === id ? { ...item, selected: !item.selected } : item
    )
    const selectedCount = images.filter((item) => item.selected).length
    this.setData({
      images,
      selectedCount,
      allSelected: images.length > 0 && selectedCount === images.length
    })
  },

  toggleSelectAll() {
    const next = !this.data.allSelected
    const images = this.data.images.map((item) => ({ ...item, selected: next }))
    const selectedCount = next ? images.length : 0
    this.setData({
      images,
      selectedCount,
      allSelected: next
    })
  },

  deleteImage(e) {
    const id = e.currentTarget.dataset.id
    const images = this.data.images.filter((item) => item.id !== id)
    const selectedCount = images.filter((item) => item.selected).length
    this.setData({
      images,
      selectedCount,
      allSelected: images.length > 0 && selectedCount === images.length
    })
  },

  async startBatchAnalysis() {
    if (!this.data.images.length) {
      wx.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }
    const targets = this.data.images.filter((item) => item.selected)
    if (!targets.length) {
      wx.showToast({ title: '请先选择图片', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: '批量识别中…', mask: true })

    const nowText = this.formatDate(new Date())
    for (const item of targets) {
      upsertHistoryRecord({
        id: item.id,
        _status: 'pending',
        name: '识别中…',
        severity: '识别中',
        date: nowText,
        image: item.path,
        imageUrl: item.path
      })
    }

    let successCount = 0
    let failCount = 0
    let hasJumped = false

    for (const item of targets) {
      const startList = this.data.images.map((img) =>
        img.id === item.id ? { ...img, status: 'running', statusText: '识别中' } : img
      )
      this.setData({ images: startList })
      const result = await this.recognizeOne(item.path, item.id)
      const doneList = this.data.images.map((img) => {
        if (img.id !== item.id) return img
        if (result.ok) {
          return { ...img, status: 'done', statusText: '完成' }
        }
        return { ...img, status: 'fail', statusText: '失败' }
      })
      this.setData({ images: doneList })
      if (result.ok) {
        successCount += 1
        if (!hasJumped) {
          hasJumped = true
          wx.hideLoading()
          this.setData({ loading: false })
          wx.switchTab({ url: '/pages/history/history' })
          this._resetOnShow = true
        }
      } else {
        failCount += 1
        upsertHistoryRecord({
          id: item.id,
          _status: 'fail',
          name: '识别失败',
          severity: '失败',
          date: this.formatDate(new Date()),
          image: item.path,
          imageUrl: item.path
        })
      }
    }

    if (!hasJumped) {
      wx.hideLoading()
      this.setData({ loading: false })
      wx.showToast({ title: `完成 ${successCount} 张${failCount ? `，失败 ${failCount} 张` : ''}`, icon: 'none' })
      wx.switchTab({ url: '/pages/history/history' })
      this._resetOnShow = true
    }
  },

  async recognizeOne(filePath, recordId) {
    let resultData = null
    let recognizedLabel = ''

    const local = await callLocalPredict({ filePath, timeoutMs: LOCAL_PREDICT_TIMEOUT_MS })
    if (local.ok && local.label) {
      recognizedLabel = local.label
      const payload = buildDiagnosisPayloadByLabel({ model: this.data.modelName, label: recognizedLabel })
      const result = await callDashScopeJson({ payload, timeoutMs: QWEN_TEXT_TIMEOUT_MS, retries: 0 })
      if (result.ok) {
        resultData = result.data
      }
    }

    if (!resultData) {
      let base64Image = ''
      try {
        base64Image = await readFileAsBase64DataUrlAsync(filePath)
      } catch (e) {
        return { ok: false, err: e }
      }
      const payload = buildDiagnosisPayloadByImage({
        model: this.data.modelName,
        base64Image
      })
      const result = await callDashScopeJson({ payload, timeoutMs: QWEN_IMAGE_TIMEOUT_MS, retries: 0 })
      if (result.ok) {
        resultData = result.data
      } else {
        return { ok: false, err: result.err }
      }
    }

    if (!resultData || typeof resultData !== 'object') {
      return { ok: false, err: new Error('parse_fail') }
    }

    resultData.imageUrl = filePath
    if (recognizedLabel) resultData.recognized_label = recognizedLabel

    const record = {
      ...resultData,
      id: recordId !== undefined ? recordId : Date.now(),
      _status: 'done',
      name: resultData.disease_name || '未知病害',
      severity: resultData.severity || '中度',
      date: this.formatDate(new Date()),
      image: resultData.imageUrl || DEMO_IMAGE
    }

    upsertHistoryRecord(record)
    return { ok: true }
  },

  formatDate(date) {
    const pad = (n) => (n < 10 ? '0' + n : '' + n)
    const y = date.getFullYear()
    const m = pad(date.getMonth() + 1)
    const d = pad(date.getDate())
    const h = pad(date.getHours())
    const min = pad(date.getMinutes())
    return `${y}-${m}-${d} ${h}:${min}`
  }
})
