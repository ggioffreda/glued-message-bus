const uuid = require('node-uuid')

function MessageBusRpc (messageBusChannel, options) {
  const trackers = {}
  const self = this

  options = options || {}
  options.callTimeout = options.callTimeout || 5000
  options.maxAttempts = options.maxAttempts || 3

  this._privateQueue = null

  this.accept = function (queue, consumer, raw, options) {
    raw = raw || false
    options = options || { durable: false }
    const ch = messageBusChannel.getChannel()

    ch.assertQueue(queue, options)
    ch.prefetch(1)
    ch.consume(queue, function (msg) {
      self._callConsumer(ch, consumer, msg, raw)
    })
  }

  this.request = function (queue, message, handler, raw) {
    raw = raw || false
    doCall(1, function (err, caller) {
      if (err) {
        handler(err)
        return
      }

      if (!raw) {
        message = new Buffer(JSON.stringify(message))
      }

      caller.send(queue, message, handler)
    }, raw)
  }

  this.getPrivateQueue = function () {
    return self._privateQueue
  }

  // Internal utilities. This is not part of the public API and will change with no notice, use at your own risk

  this._getTrackers = function () {
    return trackers
  }

  this._callConsumer = function (ch, consumer, msg, raw) {
    if (!msg.properties.replyTo || !msg.properties.correlationId) {
      // this message shouldn't be here, it has no reply to queue and/or correlation ID, reject it and return
      ch.ack(msg)
      return
    }

    var message = msg.content
    if (!raw) {
      try {
        message = JSON.parse(msg.content.toString())
      } catch (e) {
        // the message does not contain valid JSON data, reject it and return
        ch.ack(msg)
      }
    }

    consumer(message, function (reply, raw) {
      raw = raw || false
      var message = raw ? reply : new Buffer(JSON.stringify(reply))
      ch.sendToQueue(msg.properties.replyTo, message, { correlationId: msg.properties.correlationId })
      ch.ack(msg)
    })
  }

  this._replyConsumer = function (msg) {
    if (!msg.properties.correlationId || !trackers[msg.properties.correlationId]) {
      // this message shouldn't be here, it has no correlation ID or the tracker is missing/gone, return
      return
    }

    // and when you get one, fetch the correct tracker and send the response back to the caller
    const tracker = trackers[msg.properties.correlationId]
    var message = msg.content
    if (!tracker.raw) {
      try {
        message = JSON.parse(msg.content.toString())
      } catch (e) {
        return
      }
    }

    tracker.handler(null, message)
  }

  function doCall (attempt, callback, raw) {
    if (attempt > options.maxAttempts) {
      callback(new Error('Every RPC attempt timed out after ' + options.callTimeout + 'ms, ' + options.maxAttempts + ' attempts made'))
      return
    }

    // check if a private queue already exists
    if (self._privateQueue) {
      if (self._privateQueue.ready) {
        callback(null, self._privateQueue)
      } else {
        // set a timeout with a tiny component of randomness
        var channelOverride = setTimeout(function () {
          clearInterval(channelChecker)
          self._privateQueue = null
          doCall(attempt + 1, callback, raw)
        }, options.callTimeout + Math.floor(600 * Math.random()) - 300)

        // constantly try and check if ready
        var channelChecker = setInterval(function () {
          if (self._privateQueue && self._privateQueue.ready) {
            clearTimeout(channelOverride)
            clearInterval(channelChecker)
            callback(null, self._privateQueue)
          }
        }, 456)
      }
      return
    }

    // create an empty private queue to lock the initialisation
    self._privateQueue = { ready: false, send: null }

    // try and initialise the private queue
    const ch = messageBusChannel.getChannel()
    ch.assertQueue('', { exclusive: true, durable: false }, function (err, q) {
      if (err) {
        self._privateQueue = null
        callback(err)
        return
      }

      // once the queue is created successfully, start consuming reply messages
      ch.consume(q.queue, self._replyConsumer, { noAck: true })

      // set the private queue as ready
      self._privateQueue.send = function (queue, message, handler) {
        const tracker = createTracker(handler, raw)
        ch.sendToQueue(queue, message, { correlationId: tracker.id, replyTo: q.queue })
      }
      self._privateQueue.ready = true
      self._privateQueue.queue = q.queue

      // and finally return the private queue through the callback
      callback(null, self._privateQueue)
    })
  }

  function createTracker (handler, raw) {
    const id = uuid.v4()
    if (trackers[id]) {
      return createTracker()
    }
    trackers[id] = { id: id, handler: handler, raw: raw }
    return trackers[id]
  }
}

module.exports = MessageBusRpc
