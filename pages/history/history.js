const DEMO_IMAGE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%232af598"/><stop offset="1" stop-color="%23009efd"/></linearGradient></defs><rect width="100%" height="100%" fill="url(%23g)"/><circle cx="150" cy="150" r="70" fill="rgba(255,255,255,0.25)"/><path d="M110 150h80" stroke="white" stroke-width="8" stroke-linecap="round"/><path d="M150 110v80" stroke="white" stroke-width="8" stroke-linecap="round"/><text x="150" y="250" font-size="24" text-anchor="middle" fill="white">Rice</text></svg>';

Page({
  data: {
    historyList: []
  },
  onLoad() {
    this.refreshHistory()
  },
  onShow() {
    this.refreshHistory()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },
  refreshHistory() {
    const history = wx.getStorageSync('historyRecords') || []
    if (history.length > 0) {
      const list = history.map((item) => ({
        ...item,
        name: item.name || item.disease_name || '未知病害',
        severity: item.severity || '中度',
        date: item.date || '',
        image: item.image || item.imageUrl || DEMO_IMAGE
      }))
      this.setData({ historyList: list })
    }
  },
  goResult(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    wx.navigateTo({
      url: `/pages/result/result?data=${encodeURIComponent(JSON.stringify(item))}`
    })
  }
})
