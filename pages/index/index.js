// index.js
const app = getApp()

// 配置你的API KEY
const API_KEY = '';
// 阿里大模型API地址
const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const LOCAL_PREDICT_URL = 'https://u480465-85c6-93bec7ec.westc.seetacloud.com:8443/predict'
const LOCAL_PREDICT_TIMEOUT_MS = 8000
const QWEN_TEXT_TIMEOUT_MS = 25000
const QWEN_IMAGE_TIMEOUT_MS = 60000
const WARNING_MODEL_TIMEOUT_MS = 45000
const WARNING_MODEL_FAST_TIMEOUT_MS = 20000
const WARNING_MODEL_RETRIES = 1
const WARNING_MODEL_FAST_RETRIES = 0
const DEMO_IMAGE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%232af598"/><stop offset="1" stop-color="%23009efd"/></linearGradient></defs><rect width="100%" height="100%" fill="url(%23g)"/><circle cx="150" cy="150" r="70" fill="rgba(255,255,255,0.25)"/><path d="M110 150h80" stroke="white" stroke-width="8" stroke-linecap="round"/><path d="M150 110v80" stroke="white" stroke-width="8" stroke-linecap="round"/><text x="150" y="250" font-size="24" text-anchor="middle" fill="white">Rice</text></svg>';
const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast'
const REVERSE_GEOCODE_URL = 'https://nominatim.openstreetmap.org/reverse'
const REVERSE_GEOCODE_URL_BDC = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
const WEATHER_CACHE_KEY = 'homeWeatherWarningCache_v1'
const WEATHER_DEBUG = true
const WEATHER_RISK_MIN_LEVEL = '低风险'
const GEO_CACHE_KEY = 'homeGeoCache_v1'
const WARNING_MODEL_CACHE_KEY = 'homeWarningModelCache_v1'

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

function sleepAsync(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getSettingAsync() {
  return new Promise((resolve, reject) => {
    wx.getSetting({
      success: resolve,
      fail: reject
    })
  })
}

function authorizeAsync(scope) {
  return new Promise((resolve, reject) => {
    wx.authorize({
      scope,
      success: resolve,
      fail: reject
    })
  })
}

function openSettingAsync() {
  return new Promise((resolve, reject) => {
    wx.openSetting({
      success: resolve,
      fail: reject
    })
  })
}

function getLocationAsync() {
  return new Promise((resolve, reject) => {
    wx.getLocation({
      type: 'wgs84',
      isHighAccuracy: true,
      timeout: 12000,
      success: resolve,
      fail: reject
    })
  })
}

function normalizeLocationFailMsg(err) {
  const msg = String((err && err.errMsg) || err || '')
  if (msg.includes('auth deny') || msg.includes('authorize no response') || msg.includes('auth denied')) {
    return '未授权定位，请在设置中允许定位权限'
  }
  if (msg.includes('system permission denied')) {
    return '系统定位未开启，请在系统设置打开定位服务'
  }
  if (msg.includes('timeout')) {
    return '定位超时，请到空旷处重试'
  }
  return '无法获取定位，请点击重试'
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

function buildWeatherFailHint(err) {
  const msg = String((err && err.errMsg) || err || '')
  if (msg.includes('url not in domain list')) {
    return '请在小程序后台添加 api.open-meteo.com 到 request 合法域名'
  }
  return '点击卡片重试'
}

function debugLog(...args) {
  if (!WEATHER_DEBUG) return
  try {
    console.log('[weather]', ...args)
  } catch (e) {}
}

function coordCacheKey(latitude, longitude) {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''
  return `${lat.toFixed(3)},${lon.toFixed(3)}`
}

function readGeoCache(latitude, longitude) {
  const key = coordCacheKey(latitude, longitude)
  if (!key) return ''
  const cache = wx.getStorageSync(GEO_CACHE_KEY) || {}
  const item = cache[key]
  if (!item || !item.ts || !item.location) return ''
  if (Date.now() - item.ts > 7 * 24 * 60 * 60 * 1000) return ''
  return String(item.location || '').trim()
}

function writeGeoCache(latitude, longitude, location) {
  const key = coordCacheKey(latitude, longitude)
  if (!key) return
  const loc = String(location || '').trim()
  if (!loc) return
  const cache = wx.getStorageSync(GEO_CACHE_KEY) || {}
  cache[key] = { ts: Date.now(), location: loc }
  wx.setStorageSync(GEO_CACHE_KEY, cache)
}

function readWarningModelCache(latitude, longitude) {
  const key = coordCacheKey(latitude, longitude)
  if (!key) return null
  const cache = wx.getStorageSync(WARNING_MODEL_CACHE_KEY) || {}
  const item = cache[key]
  if (!item || !item.ts || !item.data) return null
  if (Date.now() - item.ts > 6 * 60 * 60 * 1000) return null
  return item.data
}

function writeWarningModelCache(latitude, longitude, data) {
  const key = coordCacheKey(latitude, longitude)
  if (!key) return
  const cache = wx.getStorageSync(WARNING_MODEL_CACHE_KEY) || {}
  cache[key] = { ts: Date.now(), data }
  wx.setStorageSync(WARNING_MODEL_CACHE_KEY, cache)
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
      return { ok: true, label, data: parsed }
    }
    return { ok: false, statusCode, data: parsed, raw: res && res.data }
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

function isChinaCoord(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false
  return lat >= 18 && lat <= 54 && lon >= 73 && lon <= 135
}

function bumpRiskLevel(level) {
  const text = String(level || '').trim()
  if (!text) return WEATHER_RISK_MIN_LEVEL
  if (text.includes('低')) return WEATHER_RISK_MIN_LEVEL
  return text
}

function adjustAlertText(text, displayRiskLevel) {
  const t = String(text || '').trim()
  if (!t) return ''
  return t
}

function buildHeuristicPestWarning(ctx) {
  const temp = typeof ctx.temperature === 'number' ? ctx.temperature : null
  const hum = typeof ctx.humidity === 'number' ? ctx.humidity : null
  const wt = String(ctx.weatherText || '')
  const rainy = wt.includes('雨') || wt.includes('雷') || wt.includes('雾')

  let score = 0
  if (temp !== null) {
    if (temp >= 20 && temp <= 30) score += 2
    else if (temp >= 31 && temp <= 35) score += 1
  }
  if (hum !== null) {
    if (hum >= 85) score += 3
    else if (hum >= 70) score += 2
    else if (hum >= 60) score += 1
  }
  if (rainy) score += 2

  let risk = WEATHER_RISK_MIN_LEVEL
  if (score >= 6) risk = '高风险'
  else if (score >= 4) risk = '中风险'

  let pests = []
  if (rainy || (hum !== null && hum >= 70)) pests = ['稻瘟病', '纹枯病']
  if (temp !== null && temp >= 28) pests = [...new Set([...pests, '二化螟', '稻飞虱'])]
  if (!pests.length) pests = ['稻瘟病']
  pests = pests.slice(0, 3)

  const alertText = `${pests.join('、')}发病风险${risk.replace('风险', '')}`
  return {
    risk_level: risk,
    alert_text: alertText.length > 32 ? alertText.slice(0, 32) : alertText,
    key_risks: pests,
    advice: [
      '勤巡田块，重点查看叶片与基部',
      '注意通风排水，降低田间湿度',
      '按当地植保建议准备药械'
    ]
  }
}

async function callDashScopeJson({ payload, timeoutMs, retries }) {
  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const t0 = Date.now()
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
        if (parsed) return { ok: true, data: parsed, ms: Date.now() - t0 }
        lastErr = new Error('parse_fail')
      } else {
        const msg =
          (res.data && res.data.error && res.data.error.message) ||
          `HTTP ${res.statusCode}`
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

function pickAiLocation(parsed) {
  if (!parsed || typeof parsed !== 'object') return ''
  const direct = String(parsed.location || '').trim()
  if (direct) return direct

  const province = String(parsed.province || parsed.state || '').trim()
  const city = String(parsed.city || '').trim()
  const district = String(parsed.district || parsed.county || parsed.area || '').trim()

  const parts = [province, city, district].filter(Boolean)
  if (parts.length) {
    const text = parts.join('·')
    if (text.length <= 16) return text
    if (city && district) return `${city}·${district}`.slice(0, 16)
    return parts.slice(0, 2).join('·').slice(0, 16)
  }

  const displayName = String(parsed.display_name || parsed.address || '').trim()
  if (displayName) {
    const cleaned = displayName.replace(/\s+/g, '')
    if (cleaned.includes('·')) return cleaned.slice(0, 16)
    const split = cleaned.split(/[，,]/).filter(Boolean)
    if (split.length >= 2) return `${split[0]}·${split[1]}`.slice(0, 16)
    return cleaned.slice(0, 16)
  }

  return ''
}

function pickBdcLocation(parsed) {
  if (!parsed || typeof parsed !== 'object') return ''
  const city = String(parsed.city || parsed.locality || '').trim()
  const admins = (parsed.localityInfo && parsed.localityInfo.administrative) || []
  const pickedDistrict = Array.isArray(admins)
    ? admins
        .map((a) => (a && a.name ? String(a.name).trim() : ''))
        .find((n) => n && (n.endsWith('区') || n.endsWith('县') || n.endsWith('旗')))
    : ''
  const district = String(pickedDistrict || '').trim()
  const province = String(parsed.principalSubdivision || '').trim()
  const parts = [province, city, district].filter(Boolean)
  if (city && district) return `${city}·${district}`.slice(0, 16)
  if (parts.length >= 2) return `${parts[0]}·${parts[1]}`.slice(0, 16)
  if (parts.length === 1) return parts[0].slice(0, 16)
  return ''
}

function getWeatherInfoByCode(code) {
  const groups = [
    { codes: [0], text: '晴', icon: '☀️' },
    { codes: [1, 2], text: '多云', icon: '⛅' },
    { codes: [3], text: '阴', icon: '☁️' },
    { codes: [45, 48], text: '雾', icon: '🌫️' },
    { codes: [51, 53, 55, 56, 57], text: '小雨', icon: '🌦️' },
    { codes: [61, 63, 65, 66, 67], text: '降雨', icon: '🌧️' },
    { codes: [71, 73, 75, 77], text: '降雪', icon: '🌨️' },
    { codes: [80, 81, 82], text: '阵雨', icon: '🌧️' },
    { codes: [95, 96, 99], text: '雷雨', icon: '⛈️' }
  ]
  const hit = groups.find((g) => g.codes.includes(Number(code)))
  return hit || { text: '天气', icon: '🌤️' }
}

function normalizeRisk(riskLevel) {
  const level = String(riskLevel || '').trim()
  if (level.includes('高')) return { label: '高风险', cls: 'risk-high' }
  if (level.includes('中')) return { label: '中风险', cls: 'risk-mid' }
  if (level.includes('低')) return { label: '低风险', cls: 'risk-low' }
  return { label: '预警', cls: 'risk-unknown' }
}

async function ensureUserLocationAuthorized() {
  const settingRes = await getSettingAsync()
  const auth = settingRes && settingRes.authSetting && settingRes.authSetting['scope.userLocation']
  if (auth === true) return true

  if (auth === false) {
    const openRes = await openSettingAsync()
    return !!(openRes && openRes.authSetting && openRes.authSetting['scope.userLocation'])
  }

  try {
    await authorizeAsync('scope.userLocation')
    return true
  } catch (e) {
    const openRes = await openSettingAsync()
    return !!(openRes && openRes.authSetting && openRes.authSetting['scope.userLocation'])
  }
}

Page({
  data: {
    imageUrl: '',
    base64Image: '',
    loading: false,
    modelName: 'qwen3.5-plus', 
    weatherLoading: false,
    warningLoading: false,
    weather: {
      icon: '🌤️',
      temperature: '--',
      humidity: '--',
      weatherText: '点击获取天气',
      location: '当前位置',
      riskLabel: '预警',
      riskClass: 'risk-unknown',
      warningText: '点击卡片刷新病虫害预警'
    },
    recentRecords: [
      { id: 1, name: '稻瘟病', severity: '中度', date: '2026-03-04 14:30', image: DEMO_IMAGE },
      { id: 2, name: '二化螟', severity: '重度', date: '2026-02-28 09:15', image: DEMO_IMAGE },
      { id: 3, name: '纹枯病', severity: '轻度', date: '2026-02-20 16:45', image: DEMO_IMAGE }
    ]
  },

  onLoad() {
    this.refreshRecent()
    this.refreshWeatherWarning({ fast: true })
  },

  onShow() {
    this.refreshRecent()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  async refreshWeatherWarning(e) {
    try {
      const reqId = (this._weatherReqId = (this._weatherReqId || 0) + 1)
      const isTapEvent = !!(e && typeof e === 'object' && e.currentTarget)
      const fast = !!(!isTapEvent && e && typeof e === 'object' && e.fast)
      debugLog('refresh start', { reqId, force: isTapEvent, fast })
      const force = isTapEvent
      const now = Date.now()
      const cached = !force ? wx.getStorageSync(WEATHER_CACHE_KEY) : null
      if (
        cached &&
        cached.ts &&
        cached.data &&
        now - cached.ts < 20 * 60 * 1000 &&
        (cached.data.warningSource !== 'heuristic' || now - cached.ts < 2 * 60 * 1000)
      ) {
        debugLog('use cache', { reqId, ageMs: now - cached.ts })
        this.setData({ weather: cached.data })
        return
      }

      this.setData({
        weatherLoading: true,
        warningLoading: false,
        weather: {
          ...this.data.weather,
          weatherText: '定位中…',
          warningText: '正在获取天气…',
          riskLabel: '预警',
          riskClass: 'risk-unknown'
        }
      })

      const watchdog = setTimeout(() => {
        if (!this.data.weatherLoading) return
        this.setData({
          weatherLoading: false,
          warningLoading: false,
          weather: {
            ...this.data.weather,
            weatherText: '获取失败',
            warningText: '请求超时，点击重试'
          }
        })
      }, 15000)

      let locationRes
      try {
        const authorized = await ensureUserLocationAuthorized()
        if (!authorized) {
          throw new Error('auth deny')
        }
        locationRes = await getLocationAsync()
        debugLog('location ok', { reqId, lat: locationRes.latitude, lon: locationRes.longitude })
      } catch (err) {
        clearTimeout(watchdog)
        const failText = normalizeLocationFailMsg(err)
        debugLog('location fail', { reqId, err: (err && err.errMsg) || String(err || '') })
        this.setData({
          weatherLoading: false,
          warningLoading: false,
          weather: {
            ...this.data.weather,
            weatherText: '定位失败',
            location: '未获取到位置',
            warningText: failText
          }
        })
        return
      }

      const latitude = Number(locationRes.latitude)
      const longitude = Number(locationRes.longitude)

      const locFallbackName = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`
      const cachedLoc = readGeoCache(latitude, longitude)
      const initialLoc = cachedLoc || locFallbackName
      this.setData({
        weather: {
          ...this.data.weather,
          location: initialLoc,
          weatherText: '获取中…',
          warningText: '正在获取天气…',
          riskLabel: '预警',
          riskClass: 'risk-unknown'
        }
      })

      const weatherPromise = requestAsync({
        url: `${WEATHER_API_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`,
        method: 'GET',
        timeout: 15000
      })

      const geoPromise = requestAsync({
        url: `${REVERSE_GEOCODE_URL}?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=12&addressdetails=1&accept-language=zh-CN`,
        method: 'GET',
        header: {
          'Content-Type': 'application/json',
          'Accept-Language': 'zh-CN'
        },
        timeout: 15000
      })

      const geoBdcPromise = requestAsync({
        url: `${REVERSE_GEOCODE_URL_BDC}?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh`,
        method: 'GET',
        timeout: 15000
      })

      const [weatherResWrap, geoResWrap, geoBdcResWrap] = await Promise.all([
        weatherPromise
          .then((v) => ({ ok: true, v }))
          .catch((err) => ({ ok: false, err })),
        geoPromise
          .then((v) => ({ ok: true, v }))
          .catch((err) => ({ ok: false, err }))
        ,
        geoBdcPromise
          .then((v) => ({ ok: true, v }))
          .catch((err) => ({ ok: false, err }))
      ])

      clearTimeout(watchdog)
      debugLog('requests done', {
        reqId,
        weatherOk: weatherResWrap.ok,
        weatherStatus: weatherResWrap.ok ? weatherResWrap.v.statusCode : undefined,
        geoOk: geoResWrap.ok,
        geoStatus: geoResWrap.ok ? geoResWrap.v.statusCode : undefined,
        geoBdcOk: geoBdcResWrap.ok,
        geoBdcStatus: geoBdcResWrap.ok ? geoBdcResWrap.v.statusCode : undefined
      })

      if (!weatherResWrap.ok || weatherResWrap.v.statusCode !== 200) {
        const reason = weatherResWrap.ok
          ? `HTTP ${weatherResWrap.v.statusCode}`
          : normalizeRequestFailMsg(weatherResWrap.err)
        const hint = weatherResWrap.ok ? '点击卡片重试' : buildWeatherFailHint(weatherResWrap.err)
        this.setData({
          weatherLoading: false,
          warningLoading: false,
          weather: {
            ...this.data.weather,
            weatherText: '获取失败',
            warningText: `${reason}，${hint}`
          }
        })
        return
      }

    const current = (weatherResWrap.v.data && weatherResWrap.v.data.current) || {}
    const temperature = current.temperature_2m
    const humidity = current.relative_humidity_2m
    const weatherCode = current.weather_code
    const weatherTime = current.time || this.formatDate(new Date())
    const info = getWeatherInfoByCode(weatherCode)

    let locationName = initialLoc
    let resolved = false
    let attemptedAiReverse = false

    if (cachedLoc) {
      resolved = true
    }

    if (!resolved && geoBdcResWrap.ok && geoBdcResWrap.v.statusCode === 200 && geoBdcResWrap.v.data) {
      const bdcLoc = pickBdcLocation(geoBdcResWrap.v.data)
      if (bdcLoc) {
        locationName = bdcLoc
        resolved = true
        writeGeoCache(latitude, longitude, bdcLoc)
        debugLog('geo resolved by bdc', { reqId, locationName })
      }
    }

    if (geoResWrap.ok && geoResWrap.v.statusCode === 200 && geoResWrap.v.data) {
      const data = geoResWrap.v.data
      const address = (data && data.address) || {}
      const province = String(address.state || address.province || '').trim()
      const city = String(address.city || address.state_district || address.region || '').trim()
      const district = String(address.county || address.city_district || address.district || address.suburb || '').trim()
      let display = ''
      if (city && district) display = `${city}·${district}`
      else display = [province, city || district].filter(Boolean).join('·')
      if (display) {
        locationName = display.length > 16 ? display.slice(0, 16) : display
        resolved = true
        writeGeoCache(latitude, longitude, locationName)
      } else if (data.display_name) {
        const cleaned = String(data.display_name).replace(/\s+/g, '')
        const split = cleaned.split(/[，,]/).filter(Boolean)
        if (split.length >= 2) {
          locationName = `${split[0]}·${split[1]}`.slice(0, 16)
          resolved = true
          writeGeoCache(latitude, longitude, locationName)
        }
      }
    }

    if (!fast && !resolved && isChinaCoord(latitude, longitude)) {
      attemptedAiReverse = true
      const aiLoc = await this.reverseGeocodeByAI({ latitude, longitude })
      const text = pickAiLocation(aiLoc)
      if (text) {
        locationName = text
        resolved = true
        writeGeoCache(latitude, longitude, text)
      }
    }

    const baseWeather = {
      ...this.data.weather,
      icon: info.icon,
      temperature: typeof temperature === 'number' ? Math.round(temperature) : '--',
      humidity: typeof humidity === 'number' ? Math.round(humidity) : '--',
      weatherText: info.text,
      location: locationName,
      warningText: '正在生成病虫害预警…',
      riskLabel: '预警',
      riskClass: 'risk-unknown'
    }

    this.setData({ weather: baseWeather, weatherLoading: false, warningLoading: true })
      debugLog('location resolved', { reqId, resolved, locationName })

    if (!fast && !resolved && !attemptedAiReverse && isChinaCoord(latitude, longitude)) {
      this.reverseGeocodeByAI({ latitude, longitude })
        .then((aiLoc) => {
          if (this._weatherReqId !== reqId) return
          const text = pickAiLocation(aiLoc)
          if (!text) return
            this.setData({ 'weather.location': text })
          writeGeoCache(latitude, longitude, text)
            const cachedNow = wx.getStorageSync(WEATHER_CACHE_KEY)
            const cachedData = cachedNow && cachedNow.data ? cachedNow.data : this.data.weather
            wx.setStorageSync(WEATHER_CACHE_KEY, { ts: Date.now(), data: { ...cachedData, location: text } })
            debugLog('location updated async', { reqId, location: text })
        })
        .catch(() => {})
    }

      if (fast) {
        const warning = { ...buildHeuristicPestWarning({ location: locationName, time: weatherTime, temperature, humidity, weatherText: info.text }), _source: 'heuristic' }
        const rawRiskLevel = warning && warning.risk_level
        const displayRiskLevel = bumpRiskLevel(rawRiskLevel)
        const risk = normalizeRisk(displayRiskLevel)
        const rawText = (warning && warning.alert_text) || '暂无预警建议，点击重试'
        const warningText = adjustAlertText(rawText, displayRiskLevel) || rawText
        this.setData({
          'weather.riskLabel': risk.label,
          'weather.riskClass': risk.cls,
          'weather.warningText': warningText,
          warningLoading: false
        })
        const latestWeather = {
          ...this.data.weather,
          riskLabel: risk.label,
          riskClass: risk.cls,
          warningText,
          warningSource: 'heuristic'
        }
        wx.setStorageSync(WEATHER_CACHE_KEY, { ts: Date.now(), data: latestWeather })
        return
      }

      const warning = await this.generatePestWarning({
      location: locationName,
      time: weatherTime,
      temperature,
      humidity,
        weatherText: info.text,
        latitude,
        longitude
        ,
        _forceModel: force
    })

      if (this._weatherReqId !== reqId) {
        debugLog('warning ignored (stale)', { reqId })
        return
      }

      const rawRiskLevel = warning && warning.risk_level
      const source = (warning && warning._source) || 'unknown'
      const displayRiskLevel = source === 'heuristic' ? bumpRiskLevel(rawRiskLevel) : String(rawRiskLevel || '').trim()
      const risk = normalizeRisk(displayRiskLevel)
      const rawText = (warning && warning.alert_text) || (warning && warning.summary) || '暂无预警建议，点击重试'
      const warningText = source === 'heuristic' ? (adjustAlertText(rawText, displayRiskLevel) || rawText) : rawText
      const warningErr = warning && warning._err ? String(warning._err) : ''
      debugLog('warning done', { reqId, source, rawRiskLevel, displayRiskLevel, warningText })

      this.setData({
        'weather.riskLabel': risk.label,
        'weather.riskClass': risk.cls,
        'weather.warningText': warningText,
        warningLoading: false
      })

      const latestWeather = {
        ...this.data.weather,
        riskLabel: risk.label,
        riskClass: risk.cls,
        warningText,
        warningSource: source
      }
      wx.setStorageSync(WEATHER_CACHE_KEY, { ts: Date.now(), data: latestWeather })
      if (force && source === 'heuristic' && warningErr) {
        wx.showToast({ title: warningErr, icon: 'none' })
      }
    } catch (err) {
      console.error('refreshWeatherWarning error:', err)
      this.setData({
        weatherLoading: false,
        warningLoading: false,
        weather: {
          ...this.data.weather,
          weatherText: '获取失败',
          warningText: '发生异常，点击重试'
        }
      })
    }
  },

  async generatePestWarning(context) {
    try {
      const forceModel = !!(context && context._forceModel)
      const lat = Number(context && context.latitude)
      const lon = Number(context && context.longitude)
      if (!forceModel && Number.isFinite(lat) && Number.isFinite(lon)) {
        const cached = readWarningModelCache(lat, lon)
        if (cached) {
          debugLog('warning use cached model', { risk_level: cached.risk_level, alert_text: cached.alert_text })
          return { ...cached, _source: 'cache' }
        }
      }

      const month = new Date().getMonth() + 1
      const cleanContext = { ...(context || {}) }
      delete cleanContext._forceModel
      const payload = {
        model: this.data.modelName,
        temperature: 0.2,
        max_tokens: 220,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是水稻植保专家。基于地点、当地时间与气象数据，判断在田水稻的主要病虫害发生风险，并给出首页一句话预警。仅返回 JSON，不要任何多余文字。不要输出“未播/无稻”等不可验证判断。'
          },
          {
            role: 'user',
            content: JSON.stringify({
              ...cleanContext,
              month,
              assume_rice_stage: '当前田间有稻（苗期-分蘖期）',
              output_schema: {
                risk_level: '高风险/中风险/低风险',
                alert_text: '首页一行提示（<=32字，包含关键病虫害与风险）',
                reasons: '数组，给出2条判断依据（可选）'
              }
            })
          }
        ]
      }

      const timeoutMs = forceModel ? WARNING_MODEL_TIMEOUT_MS : WARNING_MODEL_FAST_TIMEOUT_MS
      const retries = forceModel ? WARNING_MODEL_RETRIES : WARNING_MODEL_FAST_RETRIES
      const result = await callDashScopeJson({ payload, timeoutMs, retries })
      if (result.ok) {
        debugLog('warning parsed', { ms: result.ms, risk_level: result.data.risk_level, alert_text: result.data.alert_text })
        const data = { ...result.data, _source: 'model' }
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          writeWarningModelCache(lat, lon, data)
        }
        return data
      }

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const cached = readWarningModelCache(lat, lon)
        if (cached) {
          debugLog('warning use cached model', { risk_level: cached.risk_level, alert_text: cached.alert_text })
          return { ...cached, _source: 'cache' }
        }
      }

      const errText = normalizeRequestFailMsg(result.err)
      debugLog('warning request fail, use heuristic', { err: errText })
      return { ...buildHeuristicPestWarning(context), _source: 'heuristic', _err: errText }
    } catch (e) {
      const lat = Number(context && context.latitude)
      const lon = Number(context && context.longitude)
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const cached = readWarningModelCache(lat, lon)
        if (cached) {
          debugLog('warning use cached model', { risk_level: cached.risk_level, alert_text: cached.alert_text })
          return { ...cached, _source: 'cache' }
        }
      }

      const errText = (e && e.errMsg) || String(e || '')
      debugLog('warning request fail, use heuristic', { err: errText })
      return { ...buildHeuristicPestWarning(context), _source: 'heuristic', _err: errText }
    }
  },

  async reverseGeocodeByAI({ latitude, longitude }) {
    try {
      debugLog('ai reverse start', { latitude, longitude })
      const payload = {
        model: this.data.modelName,
        temperature: 0.1,
        max_tokens: 128,
        messages: [
          {
            role: 'system',
            content:
              '你是一个地理位置解析助手。根据经纬度推断所在地的省/市/区县或同等级行政区划（尽量精简）。必须返回合法 JSON，不要包含 Markdown 代码块。'
          },
          {
            role: 'user',
            content: JSON.stringify({
              latitude,
              longitude,
              output_schema: {
                location: '位置字符串，建议格式 省·市 或 市·区（不超过16字）',
                province: '省/直辖市/自治区，可为空',
                city: '城市/州，可为空',
                district: '区县，可为空',
                confidence: '0-100 数字'
              }
            })
          }
        ]
      }

      const result = await callDashScopeJson({ payload, timeoutMs: 15000, retries: 0 })
      if (result.ok) {
        const loc = pickAiLocation(result.data)
        if (loc) {
          debugLog('ai reverse ok', { location: loc })
          return { ...result.data, location: loc }
        }
        debugLog('ai reverse no location')
        return null
      }
      debugLog('ai reverse fail', { err: normalizeRequestFailMsg(result.err) })
      return null
    } catch (e) {
      debugLog('ai reverse fail', { err: (e && e.errMsg) || String(e || '') })
      return null
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          imageUrl: tempFilePath,
          base64Image: ''
        })
        this.startAnalysis()
      }
    })
  },

  async startAnalysis() {
    if (!this.data.imageUrl) {
      wx.showToast({ title: '请先上传图片', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    wx.showLoading({ title: 'AI 正在诊断...', mask: true });

    let resultData = null
    let recognizedLabel = ''

    const local = await callLocalPredict({ filePath: this.data.imageUrl, timeoutMs: LOCAL_PREDICT_TIMEOUT_MS })
    if (local.ok && local.label) {
      recognizedLabel = local.label
      const payload = buildDiagnosisPayloadByLabel({ model: this.data.modelName, label: recognizedLabel })
      const result = await callDashScopeJson({ payload, timeoutMs: QWEN_TEXT_TIMEOUT_MS, retries: 0 })
      if (result.ok) {
        resultData = result.data
      }
    }

    if (!resultData) {
      if (!this.data.base64Image) {
        try {
          const base64Image = await readFileAsBase64DataUrlAsync(this.data.imageUrl)
          this.setData({ base64Image })
        } catch (e) {
          wx.hideLoading()
          this.setData({ loading: false })
          wx.showToast({ title: '图片读取失败', icon: 'none' })
          return
        }
      }
      const payload = buildDiagnosisPayloadByImage({
        model: this.data.modelName,
        base64Image: this.data.base64Image
      })
      const result = await callDashScopeJson({ payload, timeoutMs: QWEN_IMAGE_TIMEOUT_MS, retries: 0 })
      if (result.ok) {
        resultData = result.data
      } else {
        wx.hideLoading()
        this.setData({ loading: false })
        wx.showToast({ title: '识别失败: ' + normalizeRequestFailMsg(result.err), icon: 'none' })
        return
      }
    }

    wx.hideLoading()
    this.setData({ loading: false })

    if (!resultData || typeof resultData !== 'object') {
      wx.showToast({ title: '解析结果失败', icon: 'none' })
      return
    }

    resultData.imageUrl = this.data.imageUrl
    if (recognizedLabel) resultData.recognized_label = recognizedLabel

    const record = {
      ...resultData,
      id: Date.now(),
      name: resultData.disease_name || '未知病害',
      severity: resultData.severity || '中度',
      date: this.formatDate(new Date()),
      image: resultData.imageUrl || DEMO_IMAGE
    }

    const history = wx.getStorageSync('historyRecords') || []
    history.unshift(record)
    wx.setStorageSync('historyRecords', history.slice(0, 50))
    this.setData({ recentRecords: history.slice(0, 3) })

    wx.navigateTo({
      url: `/pages/result/result?data=${encodeURIComponent(JSON.stringify(resultData))}`
    })
  },

  refreshRecent() {
    const history = wx.getStorageSync('historyRecords') || []
    if (history.length > 0) {
      this.setData({ recentRecords: history.slice(0, 3) })
    }
  },

  goHistory() {
    wx.switchTab({ url: '/pages/history/history' })
  },

  goResult(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    wx.navigateTo({
      url: `/pages/result/result?data=${encodeURIComponent(JSON.stringify(item))}`
    })
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
