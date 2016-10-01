Glue - Message Bus
=====================

Very simple implementation of a message bus over AMQP. Supports publish-subscribe
pattern and remote procedure calling. This is useful for building a message bus
communication exchange using RabbitMQ for example.

[![Build Status](https://travis-ci.org/ggioffreda/glued-message-bus.svg?branch=master)](https://travis-ci.org/ggioffreda/glued-message-bus)
[![JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

Usage
-----

Once the message bus is instantiated multiple modules can connect to it and
each will receive a channel through the callback. Using the channel the 
connected modules can publish messages and subscribe to particular topics.

### Connecting

Connecting modules to the message bus:

```javascript
const MessageBus = require('glued-message-bus').MessageBus;
var mb = new MessageBus('amqp://localhost');

mb.connectModule(function(channel) {
  // now you can use the channel for publishing and subscribing
});
```

### Pub-Sub

This message bus utility implements a topic based publish-subscribe pattern.

Publishing and subscribing to topics is really easy, the only important thing
about subscribing is that the subscriber function must call the callback when its
job is done otherwise the message will linger in the queue and the queue will
get stuck on it until the subscriber closes the communication channel.

```javascript
mb.subscribe('my.awesome.topic', function (key, message, callback) {
  // will receive 'Yo!' and any other message sent to 'my.awesome.topic'
  // do some stuff ...
  callback();
});

mb.publish('my.awesome.topic', 'Yo!');
```

### RPC

RPC is very easy through this library, you only need to call *accept* from your
"server" and *call* from your client.

```javascript
const rpc = mb.getRpc()

rpc.accept('my_rpc', function (request, replier) {
  // check the request and decide what to return

  // it's really important that you send the response back
  replier('response')
})

rpc.call('my_rpc', 'compute 100 primes', function (err, response) {
  if (err) throw err

  // do something with the response
})
```

Installation
------------

You can install this library using `npm`:

    npm install --save glued-message-bus

API
---

### MessageBus

- **connectModule**(callback): connects a module to the message bus, the callback
  will receive an instance of the channel created between the module and the bus;

- **getServer**(): returns the server URI;

- **getExchange**(): returns the AMQP exchange;

- **getConnection**(): returns the underlying AMQP connection.

### MessageBusChannel

- **publish**(key, message): publishes a message to the topic identified by the
  given key;

- **subscribe**(key, consumer, queue): subscribes to the given topic so that each
  message received on that topic will be passed to the given consumer. If no
  queue is specified a new private one will be created. The consumer will receive
  three parameters when a message is received:
  - key: the topic identifier;
  - msg: the message received;
  - callback: a callback that must be called once done. This is really important
    to make sure messages don't get stuck;

- **getMessageBus**(): returns the instance of the message bus;

- **getChannel**(): returns the underlying AMQP channel;

- **getRpc**(): returns the RPC utility, see below.

### MessageBusRpc

- **accept**(queue, consumer): accepts calls on the specified queue, through the
  given consumer;

- **call**(queue, message, handler): sends the message to the RPC server
  listening on that queue and handles the response through the given handler;

- **getPrivateQueue**(): return the internal private queue created for the
  callers, it's an object with the following properties:

  - *ready*, it's true if the private queue is ready for communication;

  - *queue*, the name of the private queue;

  - *send*, the internal method to send messages directly to the private queue.

Test
----

Run the tests with:

    $ npm test

License
-------

This software is released under MIT license.
