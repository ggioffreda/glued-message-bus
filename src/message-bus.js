const MessageBusErrors = require('./message-bus-errors')
const MessageBusChannel = require('./message-bus-channel')

function MessageBus (server, exchange, amqp) {
  amqp = amqp || require('amqplib')

  /**
   * The URL of the messaging queue server
   *
   * @type string
   * @access private
   */
  this._server = server

  /**
   * The name of the exchange
   *
   * @type string
   * @access private
   */
  this._exchange = exchange

  /**
   * The connection to the messaging queue server
   *
   * @type amqplib.Connection
   * @private private
   */
  this._connection = null

  /**
   * Connect the given module to the message bus and create a channel for it
   *
   * @param module the function to connect to
   */
  this.connectModule = function (module) {
    const self = this
    if (this._connection === null) {
      amqp.connect(this._server).then(function (connection) {
        self._connection = connection
        loadModule(module)
      }, function (err) {
        module(new Error(
          'Unable to connect to "' + self._server + '": ' + err.message,
          MessageBusErrors.connectionError
        ), null)
      })
    } else {
      loadModule(module)
    }
  }

  this.getServer = function () { return this._server }

  this.getExchange = function () { return this._exchange }

  this.getConnection = function () { return this._connection }

  // utility methods

  /**
   * Create a channel for the given module
   *
   * @param module the function to create the channel for
   */
  var loadModule = function (module) {
    const self = this
    this._connection.createChannel().then(function (channel) {
      channel.assertExchange(self._exchange, 'topic', { durable: true }).then(function () {
        module(null, new MessageBusChannel(self, channel, amqp))
      }, function (err) {
        module(new Error(
          'Unable to open exchange on "' + self._server + '": ' + err.message,
          MessageBusErrors.channelError
        ), null)
      })
    }, function (err) {
      module(new Error(
        'Unable to open channel on "' + self._server + '": ' + err.message,
        MessageBusErrors.channelError
      ), null)
    })
  }.bind(this)
}

module.exports = MessageBus
