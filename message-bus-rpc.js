const uuid = require('node-uuid')

function MessageBusRpc (messageBusChannel, options) {
  const trackers = {}
  const self = this

  options = options || {}
  options.callTimeout = options.callTimeout || 5000
  options.maxAttempts = options.maxAttempts || 3

  this._privateQueue = null

  this.accept = function (queue, consumer) {
    const ch = messageBusChannel.getChannel()

    ch.assertQueue(queue, { durable: false })
    ch.prefetch(1)
    ch.consume(queue, function (msg) {
      self._callConsumer(ch, consumer, msg)
    })
  }

  this.call = function (queue, message, handler) {
    doCall(1, function (err, caller) {
      if (err) {
        handler(err)
        return
      }

      caller.send(queue, message, handler)
    })
  }

  this.getPrivateQueue = function () {
    return self._privateQueue
  }

  this.getTrackers = function () {
    return trackers
  }

  // Internal utilities. This is not part of the public API and will change with no notice, use at your own risk

  this._callConsumer = function (ch, consumer, msg) {
    if (!msg.properties.replyTo || !msg.properties.correlationId) {
      // this message shouldn't be here, it has no reply to queue and/or correlation ID, reject it and return
      ch.ack(msg)
      return
    }

    consumer(msg.content, function (reply) {
      ch.sendToQueue(msg.properties.replyTo, reply, { correlationId: msg.properties.correlationId })
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
    tracker.handler(null, msg.content)
  }

  function doCall (attempt, callback) {
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
          doCall(attempt + 1, callback)
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
        const tracker = createTracker(handler)
        ch.sendToQueue(queue, message, { correlationId: tracker.id, replyTo: q.queue })
      }
      self._privateQueue.ready = true
      self._privateQueue.queue = q.queue

      // and finally return the private queue through the callback
      callback(null, self._privateQueue)
    })
  }

  function createTracker (handler) {
    const id = uuid.v4()
    if (trackers[id]) {
      return createTracker()
    }
    trackers[id] = { id: id, handler: handler }
    return trackers[id]
  }
}

module.exports = MessageBusRpc
