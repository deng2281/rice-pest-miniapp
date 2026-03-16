Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: '🏠' },
      { pagePath: '/pages/scan/scan', text: '识别', icon: '🔍' },
      { pagePath: '/pages/history/history', text: '历史', icon: '🕘' }
    ]
  },
  lifetimes: {
    attached() {
      this.updateSelected()
    }
  },
  methods: {
    updateSelected() {
      const pages = getCurrentPages()
      const route = pages.length ? '/' + pages[pages.length - 1].route : ''
      const selected = this.data.list.findIndex((i) => i.pagePath === route)
      this.setData({ selected: selected === -1 ? 0 : selected })
    },
    onSwitch(e) {
      const index = e.currentTarget.dataset.index
      const item = this.data.list[index]
      if (!item) return
      wx.switchTab({ url: item.pagePath })
      this.setData({ selected: index })
    }
  }
})
