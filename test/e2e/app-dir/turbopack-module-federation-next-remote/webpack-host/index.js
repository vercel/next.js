import('nextRemote/message').then((module) => {
  document.querySelector('#webpack-message').textContent = module.message
})
