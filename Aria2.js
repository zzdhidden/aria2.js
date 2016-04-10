;(function (global) {
  'use strict'

  var WebSocket
  var b64
  var httpclient
  var noop = function () {}

  if (typeof module !== 'undefined' && module.exports) {
    WebSocket = require('ws')
    b64 = function (str) {
      return new Buffer(str).toString('base64')
    }
    httpclient = require('httpclient')
  } else {
    WebSocket = global.WebSocket
    b64 = global.atob
    httpclient = global.HTTPClient
  }

  var Aria2 = function (opts) {
    this.callbacks = Object.create(null)
    this.lastId = 0

    for (var i in Aria2.options) {
      this[i] = typeof opts === 'object' && i in opts ? opts[i] : Aria2.options[i]
    }
  }

  Aria2.prototype.http = function (m, fn) {
    // FIXME json-rpc post wouldn't work
    var opts = {
      'host': this.host,
      'port': this.port,
      'path': this.path,
      'secure': this.secure,
      'query': {
        'method': m.method,
        'id': m.id
      }
    }

    if (Array.isArray(m.params) && m.params.length > 0) {
      opts.query.params = b64(JSON.stringify(m.params))
    }

    // browser, use jsonp
    if (typeof module !== 'undefined' && module.exports) {
      opts.jsonp = 'jsoncallback'
    }

    var that = this

    httpclient.request(opts, function (err, res) {
      if (err) return fn(err)

      var msg = opts.jsonp ? res.body : JSON.parse(res.body.toString())
      that._onmessage(msg)
    })
  }

  Aria2.prototype.send = function (method /* [,param] [,param] [,...] [, fn]*/) {
    if (typeof method !== 'string') {
      throw new TypeError(method + ' is not a string')
    }

    if (method.indexOf('system.') !== 0 && method.indexOf('aria2.') !== 0) {
      method = 'aria2.' + method
    }

    var m = {
      'method': method,
      'json-rpc': '2.0',
      'id': this.lastId++
    }

    var params = this.secret ? ['token:' + this.secret] : []

    for (var i = 1, l = arguments.length; i < l; i++) {
      var arg = arguments[i]
      if (i === arguments.length - 1 && typeof arg === 'function') {
        this.callbacks[m.id] = arg
      } else {
        params.push(arg)
      }
    }

    if (params.length > 0) m.params = params

    this.onsend(m)

    // send via websocket
    if (this.socket && this.socket.readyState === 1) {
      return this.socket.send(JSON.stringify(m))
    }

    var that = this

    // send via http
    this.http(m, function (err) {
      that.callbacks[m.id](err)
      delete that.callbacks[m.id]
    })
  }

  Aria2.prototype._onmessage = function (m) {
    this.onmessage(m)

    if (m.id !== undefined) {
      var callback = this.callbacks[m.id]
      if (callback) {
        if (m.error) {
          callback(m.error)
        } else {
          callback(null, m.result)
        }
        delete this.callbacks[m.id]
      }
    } else if (m.method) {
      var n = m.method.split('aria2.')[1]
      if (n.indexOf('on') === 0 && typeof this[n] === 'function' && Aria2.notifications.indexOf(n) > -1) {
        this[n].apply(this, m.params)
      }
    }
  }

  Aria2.prototype.open = function (fn) {
    var url = 'ws' + (this.secure ? 's' : '') + '://' + this.host + ':' + this.port + this.path
    var socket = this.socket = new WebSocket(url)
    var that = this
    var called = false

    socket.onopen = function () {
      if (fn && !called) {
        fn()
        called = true
      }
      that.onopen()
    }
    socket.onerror = function (err) {
      if (fn && !called) {
        fn(err)
        called = true
      }
    }
    socket.onclose = function () {
      that.onclose()
    }
    socket.onmessage = function (event) {
      that._onmessage(JSON.parse(event.data))
    }
  }

  Aria2.prototype.close = function (fn) {
    fn = fn || noop
    if (!this.socket) {
      fn()
      return
    }

    this.socket.addEventListener('close', function () {
      fn()
    })
    this.socket.close()
  }

  // https://aria2.github.io/manual/en/html/aria2c.html#methods
  Aria2.methods = [
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.addUri
    'addUri',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.addTorrent
    'addTorrent',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.addMetalink
    'addMetalink',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.remove
    'remove',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.forceRemove
    'forceRemove',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.pause
    'pause',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.pauseAll
    'pauseAll',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.forcePause
    'forcePause',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.forcePauseAll
    'forcePauseAll',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.unpause
    'unpause',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.unpauseAll
    'unpauseAll',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.tellStatus
    'tellStatus',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.getUris
    'getUris',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.getFiles
    'getFiles',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.getPeers
    'getPeers',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.getServers
    'getServers',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.tellActive
    'tellActive',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.tellWaiting
    'tellWaiting',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.tellStopped
    'tellStopped',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.changePosition
    'changePosition',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.changeUri
    'changeUri',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.getOption
    'getOption',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.changeOption
    'changeOption',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.getGlobalOption
    'getGlobalOption',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.changeGlobalOption
    'changeGlobalOption',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.getGlobalStat
    'getGlobalStat',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.purgeDownloadResult
    'purgeDownloadResult',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.removeDownloadResult
    'removeDownloadResult',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.getVersion
    'getVersion',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.getSessionInfo
    'getSessionInfo',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.shutdown
    'shutdown',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.forceShutdown
    'forceShutdown',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.saveSession
    'saveSession',
    // https://aria2.github.io/manual/en/html/aria2c.html#system.multicall
    'system.multicall',
    // https://aria2.github.io/manual/en/html/aria2c.html#system.listMethods
    'system.listMethods',
    // https://aria2.github.io/manual/en/html/aria2c.html#system.listNotifications
    'system.listNotifications'
  ]

  // https://aria2.github.io/manual/en/html/aria2c.html#notifications
  Aria2.notifications = [
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.onDownloadStart
    'onDownloadStart',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.onDownloadPause
    'onDownloadPause',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.onDownloadStop
    'onDownloadStop',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.onDownloadComplete
    'onDownloadComplete',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.onDownloadError
    'onDownloadError',
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.onBtDownloadComplete
    'onBtDownloadComplete'
  ]

  Aria2.events = [
    'onopen',
    'onclose',
    'onsend',
    'onmessage'
  ]

  Aria2.options = {
    'secure': false,
    'host': 'localhost',
    'port': 6800,
    'secret': '',
    'path': '/jsonrpc'
  }

  Aria2.methods.forEach(function (method) {
    var sufix = method.indexOf('.') > -1 ? method.split('.')[1] : method
    Aria2.prototype[sufix] = function (/* [param] [,param] [,...]*/) {
      this.send.apply(this, [method].concat(Array.prototype.slice.call(arguments)))
    }
  })

  Aria2.notifications.forEach(function (notification) {
    Aria2.prototype[notification] = function () {}
  })

  Aria2.events.forEach(function (event) {
    Aria2.prototype[event] = function () {}
  })

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Aria2
  } else {
    global.Aria2 = Aria2
  }
}(this))
