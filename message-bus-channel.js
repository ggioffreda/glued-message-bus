const MessageBusRpc = require('./message-bus-rpc')

function MessageBusChannel (messageBus, channel) {
  /**
   * The message bus
   *
   * @type MessageBus
   * @access private
   */
  this._messageBus = messageBus

  /**
   * The channel
   *
   * @type {amqplib.Channel}
   * @access private
   */
  this._channel = channel

  /**
   * The RPC utility
   *
   * @type {MessageBusRpc}
   * @private
   */
  this._rpc = new MessageBusRpc(this)

  /**
   * Publish a message on the message bus. If the third parameter is `true` the message must be a string or buffer
   * ready for transmission on the bus, otherwise by default the message will be JSON encoded and buffered before being
   * transmitted.
   *
   * @param key
   * @param message
   * @param raw
   */
  this.publish = function (key, message, raw) {
    raw = raw || false
    this._channel.publish(
      this._messageBus.getExchange(),
      key,
      raw ? message : new Buffer(JSON.stringify(message)),
      { persistent: true, content_type: 'application/json' }
    )
  }

  /**
   * Subscribe a consumer to a given key through the specified channel. If the third parameter is set to `true` then the
   * messages received are passed as is to the consumer, otherwise by default they are parsed through `JSON.parse()`
   * and if an error occurs they are discarded.
   *
   * @param key
   * @param consumer
   * @param queue
   * @param raw
   */
  this.subscribe = function (key, consumer, queue, raw) {
    raw = raw || false
    var options = queue ? { durable: true } : { exclusive: true }
    var self = this
    queue = queue || ''

    this._channel.prefetch(1)
    this._channel.assertQueue(queue, options).then(function (q) {
      const confirmedQueue = q.queue
      self._channel.bindQueue(confirmedQueue, self.getMessageBus().getExchange(), key)
      self._channel.consume(confirmedQueue, function (msg) {
        const routingKey = msg.fields && msg.fields.routingKey ? msg.fields.routingKey : null
        if (routingKey === null) {
          // this message is not supposed to be here, this is a topic-based implementation of the pub-sub pattern
          self._channel.ack(msg)
          return
        }

        var message = msg.content
        if (!raw) {
          try {
            message = JSON.parse(msg.content.toString())
          } catch (e) {
            // this message does not contain valid JSON content
            self._channel.ack(msg)
            return
          }
        }
        consumer(routingKey, message, function () {
          self._channel.ack(msg)
        })
      })
    }, function (err) {
      throw err
    })
  }

  this.getMessageBus = function () {
    return this._messageBus
  }

  this.getChannel = function () {
    return this._channel
  }

  this.getRpc = function () {
    return this._rpc
  }
}

module.exports = MessageBusChannel
