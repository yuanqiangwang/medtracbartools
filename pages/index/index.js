Page({
  data: {
    inputText: '',
    isDrugTrace: false,
    drugIdCode: '',
    drugSerialNo: '',
    recentHistory: [],
    codeType: 'barcode', // 'barcode' | 'qrcode'
    codeImage: '',
    // 药品查询
    drugInfo: null,
    drugLoading: false,
    quotaLoading: false,
    isLoggedIn: false,
    isVip: false,
    quotaRemaining: -1,
    // 授权弹窗
    showAvatarAuth: false,
    tempAvatarUrl: '',
    tempNickName: '',
    // 药品信息折叠
    drugInfoCollapsed: false,
    // 首页码图预览
    previewImage: ''
  },

  // 隐藏入口：连续点击标题5次进入管理后台
  _headerTapCount: 0,
  _headerTapTimer: null,
  onHeaderTap() {
    this._headerTapCount++
    clearTimeout(this._headerTapTimer)
    if (this._headerTapCount >= 5) {
      this._headerTapCount = 0
      wx.navigateTo({ url: '/pages/admin/admin' })
    } else {
      this._headerTapTimer = setTimeout(() => {
        this._headerTapCount = 0
      }, 2000)
    }
  },

  onLoad() {
    this.loadHistory()
    this.checkLoginAndQuota()
  },

  onShow() {
    this.loadHistory()
    if (this.data.isLoggedIn) {
      this.checkQuota()
    }
  },

  loadHistory() {
    try {
      const scanHistory = wx.getStorageSync('scan_history') || []
      const genHistory = wx.getStorageSync('gen_history') || []
      const all = []
      scanHistory.forEach(item => {
        all.push({
          value: item.value,
          source: 'scan',
          sourceLabel: '扫码',
          type: item.type,
          time: item.time,
          timestamp: item.timestamp
        })
      })
      genHistory.forEach(item => {
        all.push({
          value: item.text,
          source: 'generate',
          sourceLabel: '生成码',
          type: item.typeLabel,
          time: item.time,
          timestamp: item.timestamp,
          imagePath: item.imagePath || ''
        })
      })
      all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      this.setData({ recentHistory: all.slice(0, 5) })
    } catch (e) {
      console.error('读取历史失败', e)
    }
  },

  onInputChange(e) {
    const text = e.detail.value
    const info = this.parseDrugTrace(text.trim())
    this.setData({
      inputText: text,
      ...info
    })
    // 防抖即时生成
    if (this._generateTimer) clearTimeout(this._generateTimer)
    if (!text.trim()) {
      this.setData({ codeImage: '' })
      return
    }
    this._generateTimer = setTimeout(() => {
      this.generateCode()
    }, 400)
  },

  copyInputText() {
    if (!this.data.inputText) return
    wx.setClipboardData({ data: this.data.inputText, success: () => { wx.showToast({ title: '已复制', icon: 'success' }) } })
  },

  clearInputText() {
    this.setData({ inputText: '', codeImage: '', isDrugTrace: false, drugIdCode: '', drugSerialNo: '', drugInfo: null })
  },

  toggleDrugInfo() {
    this.setData({ drugInfoCollapsed: !this.data.drugInfoCollapsed })
  },

  // 识别药品追溯码
  parseDrugTrace(text) {
    // 8或9开头的20位纯数字
    if (/^[89]\d{19}$/.test(text)) {
      return {
        isDrugTrace: true,
        drugIdCode: text.substring(0, 7),
        drugSerialNo: text.substring(7)
      }
    }
    return {
      isDrugTrace: false,
      drugIdCode: '',
      drugSerialNo: ''
    }
  },

  switchCodeType(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.codeType) return
    this.setData({ codeType: type, codeImage: '' })
    // 如果已有输入内容，切换后自动重新生成
    if (this.data.inputText.trim()) {
      this.generateCode()
    }
  },

  quickGenerate() {
    this.generateCode()
  },

  generateCode() {
    if (this.data.codeType === 'qrcode') {
      this.generateQR()
    } else {
      this.generateBar()
    }
  },

  generateQR() {
    const text = this.data.inputText.trim()
    if (!text) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    this.setData({ codeImage: '' })
    const query = wx.createSelectorQuery()
    query.select('#qrcodeCanvas')
      .fields({ node: true, size: true })
      .exec(async (res) => {
        try {
          if (!res[0]) { wx.showToast({ title: '生成失败', icon: 'none' }); return }
          const canvas = res[0].node
          const drawQrcode = require('weapp-qrcode-canvas-2d')
          await drawQrcode({
            canvas, canvasId: 'qrcodeCanvas',
            width: 260, padding: 20,
            background: '#ffffff', foreground: '#000000',
            text, correctLevel: 2
          })
          wx.canvasToTempFilePath({
            canvas, x: 0, y: 0, width: 260, height: 260, destWidth: 780, destHeight: 780,
            success: (res) => {
              this.setData({ codeImage: res.tempFilePath })
              this.saveToHistory(text, 'qrcode', res.tempFilePath)
            },
            fail: () => { wx.showToast({ title: '导出失败', icon: 'none' }) }
          })
        } catch (e) {
          wx.showToast({ title: '二维码生成失败', icon: 'none' })
        }
      })
  },

  generateBar() {
    const text = this.data.inputText.trim()
    if (!text) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    if (!/^[\x00-\x7F]+$/.test(text)) {
      wx.showToast({ title: '条形码仅支持英文数字符号', icon: 'none' })
      return
    }
    this.setData({ codeImage: '' })
    const query = wx.createSelectorQuery()
    query.select('#barcodeCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        try {
          if (!res[0]) { wx.showToast({ title: '生成失败', icon: 'none' }); return }
          const canvas = res[0].node
          const dpr = wx.getWindowInfo().pixelRatio

          // 使用固定逻辑尺寸绘制，避免 CSS 尺寸不确定
          const w = 680
          const h = 280
          canvas.width = w * dpr
          canvas.height = h * dpr
          const ctx = canvas.getContext('2d')
          ctx.scale(dpr, dpr)

          const textAreaH = 48
          const barAreaH = h - textAreaH
          const quiet = Math.round(w / 40)
          const barAreaW = w - quiet * 2

          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)

          const codes = this.stringToCode128(text)
          // 每个符号 11 个模块宽度, STOP 符号 13 个模块宽度
          const totalModules = (codes.length - 1) * 11 + 13
          const moduleW = barAreaW / totalModules
          let xPos = quiet
          for (let i = 0; i < codes.length; i++) {
            const c = codes[i]
            const pattern = this.CODE128_PATTERNS[c]
            for (let bar = 0; bar < pattern.length; bar++) {
              const bw = pattern[bar] * moduleW
              if (bar % 2 === 0) {
                ctx.fillStyle = '#000000'
                ctx.fillRect(xPos, 0, bw, barAreaH)
              }
              xPos += bw
            }
          }

          // 底部显示文本
          ctx.fillStyle = '#000000'
          ctx.font = '22px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(text, w / 2, h - textAreaH / 2)

          wx.canvasToTempFilePath({
            canvas,
            x: 0, y: 0,
            width: w, height: h,
            destWidth: w * dpr, destHeight: h * dpr,
            success: (r) => {
              this.setData({ codeImage: r.tempFilePath })
              this.saveToHistory(text, 'barcode', r.tempFilePath)
            },
            fail: (err) => { console.error('条形码导出失败:', err); wx.showToast({ title: '导出失败', icon: 'none' }) }
          })
        } catch (e) {
          console.error('条形码生成失败', e)
          wx.showToast({ title: '条形码生成失败', icon: 'none' })
        }
      })
  },

  closePreview() {
    this.setData({ codeImage: '' })
  },

  saveImage() {
    if (!this.data.codeImage) return
    wx.saveImageToPhotosAlbum({
      filePath: this.data.codeImage,
      success: () => { wx.showToast({ title: '已保存', icon: 'success' }) },
      fail: (err) => {
        if (err.errMsg.includes('auth deny') || err.errMsg.includes('authorize')) {
          wx.showModal({
            title: '提示', content: '需要相册权限才能保存，是否前往设置？',
            success: (res) => { if (res.confirm) wx.openSetting() }
          })
        }
      }
    })
  },

  copyText() {
    if (!this.data.inputText) return
    wx.setClipboardData({ data: this.data.inputText, success: () => { wx.showToast({ title: '已复制', icon: 'success' }) } })
  },

  // ===== 登录与配额 =====
  checkLoginAndQuota() {
    this.setData({ quotaLoading: true })
    wx.cloud.callFunction({
      name: 'drugQuery',
      data: { action: 'login' },
      success: (res) => {
        console.log('login 返回:', JSON.stringify(res))
        if (res.result && res.result.code === 0) {
          const userInfo = res.result.data && res.result.data.userInfo
          // 只有已有用户信息（昵称/头像）才算已登录
          if (userInfo && userInfo.nickName) {
            this.setData({ isLoggedIn: true })
            this.checkQuota()
          } else {
            this.setData({ isLoggedIn: false, quotaLoading: false })
          }
        } else {
          this.setData({ isLoggedIn: false, quotaLoading: false })
        }
      },
      fail: (err) => {
        console.error('login 失败:', JSON.stringify(err))
        this.setData({ isLoggedIn: false, quotaLoading: false })
      }
    })
  },

  checkQuota() {
    wx.cloud.callFunction({
      name: 'drugQuery',
      data: { action: 'checkQuota' },
      success: (res) => {
        if (res.result.code === 0) {
          const d = res.result.data
          this.setData({
            isVip: d.isVip,
            quotaRemaining: d.isVip ? -1 : d.remaining,
            quotaLoading: false
          })
        } else {
          this.setData({ quotaLoading: false })
        }
      },
      fail: () => {
        this.setData({ quotaLoading: false })
      }
    })
  },

  // ===== 药品查询 =====
  onQueryDrug() {
    if (!this.data.isLoggedIn) {
      this.setData({ showAvatarAuth: true })
      return
    }
    this.doQueryDrug()
  },

  doQueryDrug() {
    const code = this.data.inputText.trim()
    if (!code) {
      wx.showToast({ title: '请输入追溯码', icon: 'none' })
      return
    }
    this.setData({ drugLoading: true, drugInfo: null })
    wx.cloud.callFunction({
      name: 'drugQuery',
      data: {
        action: 'queryDrug',
        code: code
      },
      success: (res) => {
        const result = res.result
        if (result.code === 0) {
          const data = result.data
          // 解析阿里健康码上放心 API 返回数据
          try {
            const dtoList = data && data.result && data.result.models && data.result.models.code_full_info_dto
            if (dtoList && dtoList.length > 0) {
              const item = dtoList[0]
              const drug = item.drug_ent_base_d_t_o || {}
              const prod = (item.code_produce_info_d_t_o && item.code_produce_info_d_t_o.produce_info_list && item.code_produce_info_d_t_o.produce_info_list.produce_info_dto && item.code_produce_info_d_t_o.produce_info_list.produce_info_dto[0]) || {}
              const ent = item.p_user_ent_d_t_o || {}
              const statusDto = item.code_status_type_d_t_o || {}

              // 状态码映射：I=在库, S=出库, X=已核销, D=已注销
              const statusMap = { 'A': '已激活', 'I': '已核注', 'O': '已核销', 'C': '已注销', 'E': '码不存在' }
              const statusCode = statusDto.code_status || ''
              const statusText = statusMap[statusCode] || statusCode

              // 码等级映射：包装比例1:5:10 → 码等级3=大码, 2=中码, 1=小码
              const levelMap = { '1': '小码', '2': '中码', '3': '大码' }
              const levelVal = String(item.package_level || '')

              const info = {
                drugName: drug.physic_name || '未知药品',
                approvalNo: drug.approval_licence_no || '',
                producer: ent.ent_name || '',
                spec: drug.prepn_spec || '',
                pkgSpec: drug.pkg_spec_crit || '',
                dosageForm: drug.prepn_type_desc || '',
                physicType: drug.physic_type_desc || '',
                exprie: drug.exprie || '',
                batchNo: prod.batch_no || '',
                produceDate: prod.original_produce_date || prod.produce_date_str || '',
                expireDate: prod.original_expire_date || prod.expire_date || '',
                pkgAmount: prod.pkg_amount || '',
                packageLevel: levelMap[levelVal] || (levelVal ? levelVal + '级码' : ''),
                status: statusText
              }
              this.setData({ drugInfo: info, drugLoading: false })
              this.checkQuota()
            } else {
              this.setData({ drugInfo: { empty: true }, drugLoading: false })
            }
          } catch (e) {
            console.error('解析药品数据失败:', e)
            this.setData({ drugInfo: { empty: true }, drugLoading: false })
          }
        } else if (result.code === 403) {
          this.setData({ drugInfo: { error: true, msg: result.msg }, drugLoading: false, quotaRemaining: 0 })
        } else {
          this.setData({ drugInfo: { error: true, msg: result.msg || '查询失败' }, drugLoading: false })
        }
      },
      fail: () => {
        this.setData({ drugInfo: { error: true, msg: '网络错误' }, drugLoading: false })
      }
    })
  },

  // ===== 授权弹窗 =====
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    if (avatarUrl) {
      this.setData({ tempAvatarUrl: avatarUrl })
    }
  },

  onNickNameInput(e) {
    const val = e.detail.value
    if (val) this.setData({ tempNickName: val })
  },

  onCancelAuth() {
    this.setData({ showAvatarAuth: false })
  },

  onConfirmAuth() {
    const { tempNickName, tempAvatarUrl } = this.data
    const nickName = tempNickName
    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })

    const doSave = (avatarUrl) => {
      console.log('开始保存用户信息:', { nickName, avatarUrl })
      wx.cloud.callFunction({
        name: 'drugQuery',
        data: {
          action: 'saveUserInfo',
          nickName: nickName,
          avatarUrl: avatarUrl || ''
        },
        success: (res) => {
          wx.hideLoading()
          console.log('saveUserInfo 返回:', JSON.stringify(res))
          if (res.result && res.result.code === 0) {
            this.setData({ showAvatarAuth: false, isLoggedIn: true })
            this.checkQuota()
            this.doQueryDrug()
          } else {
            wx.showToast({
              title: (res.result && res.result.msg) || '保存失败',
              icon: 'none',
              duration: 3000
            })
          }
        },
        fail: (err) => {
          wx.hideLoading()
          console.error('saveUserInfo 调用失败:', JSON.stringify(err))
          wx.showToast({
            title: '网络错误: ' + (err.errMsg || ''),
            icon: 'none',
            duration: 4000
          })
        }
      })
    }

    if (tempAvatarUrl) {
      // 非 cloud:// 开头的都视为临时文件，需上传到云存储
      if (tempAvatarUrl.startsWith('cloud://')) {
        doSave(tempAvatarUrl)
      } else {
        const ext = tempAvatarUrl.split('.').pop() || 'jpg'
        const cloudPath = 'avatars/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext
        console.log('上传头像:', tempAvatarUrl, '→', cloudPath)
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempAvatarUrl,
          success: (res) => {
            console.log('头像上传成功:', res.fileID)
            doSave(res.fileID)
          },
          fail: (err) => {
            console.error('头像上传失败:', JSON.stringify(err))
            doSave('')
          }
        })
      }
    } else {
      doSave('')
    }
  },

  handleContact(e) {
    console.log('客服会话', e.detail)
  },

  // Code 128 编码
  // 每个符号6个宽度值(3条bar + 3空space), 最后1个终止条
  CODE128_PATTERNS: [
    [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
    [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
    [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
    [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
    [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
    [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
    [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
    [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
    [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
    [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
    [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
    [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
    [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
    [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
    [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
    [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
    [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
    [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
    [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
    [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
    [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
    [2,1,1,2,3,2],[2,3,3,1,1,1,2]
  ],

  stringToCode128(text) {
    const START_B = 104
    const START_C = 105
    const STOP = 106
    const CODE_B = 100
    const CODE_C = 99

    const bytes = []
    for (let i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i))

    // 决定是否使用 Code C（纯数字且偶数长度时更高效）
    // 简单策略：如果全是数字且长度 >= 4，用 Code C
    const allDigits = bytes.every(b => b >= 48 && b <= 57)

    const codes = []

    if (allDigits && bytes.length >= 4) {
      // 使用 Code C 编码纯数字（两位一组）
      codes.push(START_C)
      let i = 0
      while (i < bytes.length) {
        if (bytes.length - i >= 2) {
          codes.push(parseInt(String.fromCharCode(bytes[i]) + String.fromCharCode(bytes[i + 1])))
          i += 2
        } else {
          // 奇数位最后一位切到 Code B
          codes.push(CODE_B)
          codes.push(bytes[i] - 32)
          i++
        }
      }
    } else {
      // 使用 Code B 编码
      codes.push(START_B)
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i]
        if (b >= 32 && b <= 127) {
          codes.push(b - 32)
        } else {
          // 非 Code B 范围的字符忽略（实际不会出现，因为前面已校验 ASCII）
          codes.push(0)
        }
      }
    }

    // 计算校验和
    let checksum = codes[0]
    for (let i = 1; i < codes.length; i++) {
      checksum += i * codes[i]
    }
    codes.push(checksum % 103)
    codes.push(STOP)

    return codes
  },

  goToScan() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['barCode', 'qrCode', 'datamatrix', 'pdf417'],
      success: (res) => {
        const result = res.result || ''
        if (!result) return
        const info = this.parseDrugTrace(result.trim())
        // 根据扫码类型设置码类型
        const isQR = res.scanType === 'QR_CODE' || res.scanType === 'DATA_MATRIX' || res.scanType === 'PDF_417'
        this.setData({ inputText: result, drugInfo: null, codeType: isQR ? 'qrcode' : 'barcode', codeImage: '', ...info })
        // 保存扫码历史
        this.saveScanHistory(result, res.scanType)
        // 自动生成码预览
        this.generateCode()
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '扫码失败', icon: 'none' })
        }
      }
    })
  },

  saveToHistory(text, type, imagePath) {
    try {
      let genHistory = wx.getStorageSync('gen_history') || []
      const now = new Date()
      const timestamp = now.getTime()
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
      // 去重
      genHistory = genHistory.filter(item => !(item.text === text && item.type === type))
      genHistory.unshift({
        text,
        type,
        typeLabel: type === 'qrcode' ? '二维码' : '条形码',
        time: timeStr,
        date,
        timestamp,
        imagePath: imagePath || ''
      })
      if (genHistory.length > 100) genHistory = genHistory.slice(0, 100)
      wx.setStorageSync('gen_history', genHistory)
    } catch (e) {
      console.error('保存生成历史失败', e)
    }
  },

  saveScanHistory(value, scanType) {
    try {
      let scanHistory = wx.getStorageSync('scan_history') || []
      const now = new Date()
      const timestamp = now.getTime()
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
      const type = (scanType === 'QR_CODE' || scanType === 'DATA_MATRIX' || scanType === 'PDF_417') ? '二维码' : '条形码'
      // 去重
      scanHistory = scanHistory.filter(item => !(item.value === value && item.type === type))
      scanHistory.unshift({
        value,
        type,
        time: timeStr,
        date,
        timestamp
      })
      if (scanHistory.length > 100) scanHistory = scanHistory.slice(0, 100)
      wx.setStorageSync('scan_history', scanHistory)
      this.setData({ recentHistory: scanHistory.slice(0, 5) })
    } catch (e) {
      console.error('保存扫码历史失败', e)
    }
  },

  // 点击历史项 - 生成码记录弹出预览，扫码记录复制内容
  onHistoryItemTap(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.recentHistory[index]
    if (!item) return
    if (item.source === 'generate' && item.imagePath) {
      this.setData({ previewImage: item.imagePath })
    } else {
      wx.setClipboardData({
        data: item.value,
        success: () => { wx.showToast({ title: '已复制', icon: 'success' }) }
      })
    }
  },

  closeImagePreview() {
    this.setData({ previewImage: '' })
  },

  savePreviewImage() {
    if (!this.data.previewImage) return
    wx.saveImageToPhotosAlbum({
      filePath: this.data.previewImage,
      success: () => { wx.showToast({ title: '已保存', icon: 'success' }) },
      fail: (err) => {
        if (err.errMsg.includes('auth deny') || err.errMsg.includes('authorize')) {
          wx.showModal({
            title: '提示', content: '需要相册权限才能保存，是否前往设置？',
            success: (res) => { if (res.confirm) wx.openSetting() }
          })
        }
      }
    })
  },

  // 查看全部历史
  viewAllHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  },

  // 清空历史
  clearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有扫码历史吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('scan_history')
          this.setData({ recentHistory: [] })
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  }
})
