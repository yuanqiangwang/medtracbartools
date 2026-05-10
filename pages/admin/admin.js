Page({
  data: {
    isAdmin: false,
    myOpenid: '',
    users: [],
    loading: false
  },

  onLoad() {
    this.checkAdmin()
  },

  onShow() {
    if (this.data.isAdmin) {
      this.loadUsers()
    }
  },

  // 检查是否为管理员
  checkAdmin() {
    wx.cloud.callFunction({
      name: 'drugQuery',
      data: { action: 'admin_getMyOpenid' }
    }).then(res => {
      const result = res.result || {}
      if (result.code === 0 && result.data && result.data.openid) {
        this.setData({ myOpenid: result.data.openid })
        // 尝试调用管理员接口验证权限
        this.loadUsers()
      }
    }).catch(err => {
      console.error('获取openid失败:', err)
    })
  },

  // 加载用户列表
  loadUsers() {
    this.setData({ loading: true })
    wx.cloud.callFunction({
      name: 'drugQuery',
      data: { action: 'admin_listUsers' }
    }).then(res => {
      const result = res.result || {}
      if (result.code === 0 && result.data) {
        this.setData({ isAdmin: true, users: result.data.users || [], loading: false })
      } else if (result.code === 403) {
        this.setData({ isAdmin: false, loading: false })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: result.msg || '加载失败', icon: 'none' })
      }
    }).catch(err => {
      console.error('加载用户失败:', err)
      this.setData({ loading: false })
    })
  },

  // 设为VIP
  addVip(e) {
    const openid = e.currentTarget.dataset.openid
    wx.showModal({
      title: '确认设为VIP',
      content: `为用户 ${openid.substring(0, 8)}... 设为VIP？`,
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '设置中...' })
        wx.cloud.callFunction({
          name: 'drugQuery',
          data: { action: 'admin_addVip', targetOpenid: openid }
        }).then(res => {
          wx.hideLoading()
          const result = res.result || {}
          if (result.code === 0) {
            wx.showToast({ title: '设置成功', icon: 'success' })
            this.loadUsers()
          } else {
            wx.showToast({ title: result.msg || '设置失败', icon: 'none' })
          }
        }).catch(err => {
          wx.hideLoading()
          console.error('添加VIP失败:', err)
        })
      }
    })
  },

  // 取消VIP
  removeVip(e) {
    const openid = e.currentTarget.dataset.openid
    wx.showModal({
      title: '确认取消VIP',
      content: `取消用户 ${openid.substring(0, 8)}... 的VIP？`,
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '设置中...' })
        wx.cloud.callFunction({
          name: 'drugQuery',
          data: { action: 'admin_removeVip', targetOpenid: openid }
        }).then(res => {
          wx.hideLoading()
          const result = res.result || {}
          if (result.code === 0) {
            wx.showToast({ title: '已取消VIP', icon: 'success' })
            this.loadUsers()
          } else {
            wx.showToast({ title: result.msg || '操作失败', icon: 'none' })
          }
        }).catch(err => {
          wx.hideLoading()
          console.error('取消VIP失败:', err)
        })
      }
    })
  }
})