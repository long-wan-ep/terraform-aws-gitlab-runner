const path = require('path')

module.exports = (async () => {
  return {
    target: 'node',
    mode: 'production',
    optimization: {
      minimize: true,
    },
    output: {
      filename: 'index.js',
      library: {
        type: 'commonjs',
      },
      path: path.resolve(__dirname, './dist/lambda'),
    },
  }
})()
