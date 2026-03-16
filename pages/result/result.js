const DEMO_IMAGE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%232af598"/><stop offset="1" stop-color="%23009efd"/></linearGradient></defs><rect width="100%" height="100%" fill="url(%23g)"/><circle cx="150" cy="150" r="70" fill="rgba(255,255,255,0.25)"/><path d="M110 150h80" stroke="white" stroke-width="8" stroke-linecap="round"/><path d="M150 110v80" stroke="white" stroke-width="8" stroke-linecap="round"/><text x="150" y="250" font-size="24" text-anchor="middle" fill="white">Rice</text></svg>';

Page({
  data: {
    result: null,
    activeTab: 'pathogen', // pathogen, harm, trend
    // 默认数据用于预览（如果未传入参数）
    defaultData: {
      imageUrl: DEMO_IMAGE,
      disease_name: '稻瘟病 (叶瘟)',
      scientific_name: 'Magnaporthe oryzae',
      confidence: 98.2,
      diagnosis: '叶面出现典型菱形病斑，中部灰褐色，边缘红褐色，符合典型稻瘟病特征。',
      severity: '中度',
      pathogen_info: '稻瘟病原菌为半知菌亚门梨孢属。分生孢子梗簇生，无色至淡色。',
      harm_level_desc: '当前属于发病初期至中期。如不控制，可能引发穗颈瘟，导致颗粒无收。',
      harm_percentage: 66,
      trend_prediction: '未来三天有持续降雨，病斑扩散速度将加快 30% 以上。',
      prevention_measures: []
    }
  },

  onLoad(options) {
    if (options.data) {
      try {
        const result = JSON.parse(decodeURIComponent(options.data));
        this.setData({ result });
      } catch (e) {
        console.error(e);
        this.setData({ result: this.data.defaultData });
      }
    } else {
      // 调试用
      this.setData({ result: this.data.defaultData });
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  viewReport() {
    wx.navigateTo({
      url: `/pages/report/report?data=${encodeURIComponent(JSON.stringify(this.data.result))}`
    });
  },

  reScan() {
    wx.navigateBack();
  }
})
