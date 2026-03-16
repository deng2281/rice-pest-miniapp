Page({
  data: {
    result: null
  },

  onLoad(options) {
    if (options.data) {
      try {
        const result = JSON.parse(decodeURIComponent(options.data));
        // 如果没有防治措施数据，添加一些默认的以便展示UI效果
        if (!result.prevention_measures || result.prevention_measures.length === 0) {
            result.prevention_measures = [
                { type: '化学防治', content: '发病初期喷洒20%三环唑可湿性粉剂1000倍液，或40%稻瘟灵乳油1000倍液。' },
                { type: '生物防治', content: '利用枯草芽孢杆菌等生物制剂进行防治，减少化学农药使用。' },
                { type: '农艺措施', content: '合理施肥，增施磷钾肥，避免氮肥过量；浅水勤灌，适时晒田。' }
            ];
        }
        this.setData({ result });
      } catch (e) {
        console.error(e);
      }
    }
  },

  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  copyMeasures() {
      wx.setClipboardData({
          data: this.data.result.prevention_measures.map(m => `${m.type}: ${m.content}`).join('\n'),
          success: () => {
              wx.showToast({ title: '防治方案已复制', icon: 'success' });
          }
      });
  }
})
