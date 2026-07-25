process.on('message', (message) => {
  if (message && message.type === 'call' && process.send) {
    if (message.args?.[0] === 'exit') {
      setTimeout(() => process.exit(0), 10);
      return;
    }

    process.send(
      {
        type: 'resolve',
        id: message.id,
        value: process.pid,
      },
    );
  }
});
