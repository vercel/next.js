const _data = {
  allPosts: [
    {
      votes: 0,
      url: 'https://3',
      __typename: 'Post',
      id: 'ck8kfpxdr0wl20199sdhvme3o',
      title: '111',
    },
    {
      votes: 6,
      url: 'https://fg',
      __typename: 'Post',
      id: 'ck8k7mrf512gw014390v1ppox',
      title: 'dfgfdg',
    },
    {
      votes: 0,
      url: 'https://dfg',
      __typename: 'Post',
      id: 'ck8k7mp9h120f01977b09vo9h',
      title: 'fg',
    },
    {
      votes: 9,
      url: 'https:///noice',
      __typename: 'Post',
      id: 'ck8k44yrh0ads0132ixp1abke',
      title: 'heyghdf',
    },
    {
      votes: 3,
      url: 'https://subit',
      __typename: 'Post',
      id: 'ck8jwbcko0dx9019733rygieb',
      title: 'submit',
    },
    {
      votes: 0,
      url: 'https://fushigi',
      __typename: 'Post',
      id: 'ck8jwai7u0dh30198hn5n94ff',
      title: 'aaa',
    },
    {
      votes: 2,
      url: 'https://sing',
      __typename: 'Post',
      id: 'ck8jwa2ff0did0171xl8eqasp',
      title: 'aa',
    },
    {
      votes: 15,
      url: 'https://google.com',
      __typename: 'Post',
      id: 'ck8j1qtbn16sy012064l9s5jy',
      title: 'test',
    },
    {
      votes: 10,
      url: 'https://flatlay.io/',
      __typename: 'Post',
      id: 'ck8ivm53k1siy01745ah8aczp',
      title: 'ddcsc',
    },
    {
      votes: 3,
      url: 'https://d',
      __typename: 'Post',
      id: 'ck8iqmkjx0pkk0101j0w6shje',
      title: 'd',
    },
  ],
  _allPostsMeta: {
    count: 10,
  },
}

// setInterval(() => {
//   const gen = Math.random().toString(36)
//   const newPost = {
//     votes: Math.floor(Math.random() * 10),
//     url: `https://${gen.substr(2, 5)}`,
//     __typename: 'Post',
//     id: gen.substr(2),
//     title: gen.substr(2),
//   }
//
//   _data.allPosts = [..._data.allPosts, newPost]
//   console.log('allPosts length', _data.allPosts.length)
//   _data._allPostsMeta = { count: _data.allPosts.length }
// }, (Math.random() * 1000) + 4000)

export const getData = () => _data
