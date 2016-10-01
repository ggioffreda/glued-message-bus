const MessageBusRpc = require('./message-bus-rpc');

function MessageBusChannel(messageBus, channel) {

  /**
   * The message bus
   *
   * @type MessageBus
   * @access private
   */
  this._messageBus = messageBus;

  /**
   * The channel
   *
   * @type {amqplib.Channel}
   * @access private
   */
  this._channel = channel;

  /**
   * The RPC utility
   *
   * @type {MessageBusRpc}
   * @private
   */
  this._rpc = new MessageBusRpc(this);

  /**
   * Publish a message on the message bus
   *
   * @param key
   * @param message
   */
  this.publish = function (key, message) {
    this._channel.publish(
      this._messageBus.getExchange(),
      key,
      message,
      { persistent: true, content_type: 'application/json' }
    );
  };

  /**
   * Subscribe a consumer to a given key through the specified channel
   *
   * @param key
   * @param consumer
   * @param queue
   */
  this.subscribe = function (key, consumer, queue) {
    var options = queue ? { durable: true } : { exclusive: true },
      self = this;
    queue = queue || '';

    this._channel.prefetch(1);
    this._channel.assertQueue(queue, options).then(function(q) {
      const confirmedQueue = q.queue;
      self._channel.bindQueue(confirmedQueue, self.getMessageBus().getExchange(), key);
      self._channel.consume(confirmedQueue, function (msg) {
        const routingKey = msg.fields && msg.fields.routingKey ? msg.fields.routingKey : null;
        consumer(routingKey, msg.content, function () {
          self._channel.ack(msg);
        });
      });
    }, function (err) {
      throw err;
    });
  };

  this.getMessageBus = function () {
    return this._messageBus;
  };

  this.getChannel = function () {
    return this._channel;
  };

  this.getRpc = function () {
    return this._rpc;
  };
}

module.exports = MessageBusChannel;
