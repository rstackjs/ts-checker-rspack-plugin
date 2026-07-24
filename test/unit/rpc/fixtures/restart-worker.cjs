process.on('message', (message) => {
  if (message && message.type === 'call' && process.send) {
    process.send(
      {
        type: 'resolve',
        id: message.id,
        value: process.pid,
      },
      () => process.exit(0),
    );
  }
});
