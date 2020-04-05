// TODO: rename
const blah = {
  data: {
    allPosts: [
      {
        votes: 0,
        url: 'https://3',
        __typename: 'Post',
        id: 'ck8kfpxdr0wl20199sdhvme3o',
        createdAt: '2020-04-03T17:01:08.000Z',
        title: '111',
      },
      {
        votes: 6,
        url: 'https://fg',
        __typename: 'Post',
        id: 'ck8k7mrf512gw014390v1ppox',
        createdAt: '2020-04-03T13:14:43.000Z',
        title: 'dfgfdg',
      },
      {
        votes: 0,
        url: 'https://dfg',
        __typename: 'Post',
        id: 'ck8k7mp9h120f01977b09vo9h',
        createdAt: '2020-04-03T13:14:40.000Z',
        title: 'fg',
      },
      {
        votes: 9,
        url: 'https:///noice',
        __typename: 'Post',
        id: 'ck8k44yrh0ads0132ixp1abke',
        createdAt: '2020-04-03T11:36:54.000Z',
        title: 'heyghdf',
      },
      {
        votes: 3,
        url: 'https://subit',
        __typename: 'Post',
        id: 'ck8jwbcko0dx9019733rygieb',
        createdAt: '2020-04-03T07:57:55.000Z',
        title: 'submit',
      },
      {
        votes: 0,
        url: 'https://fushigi',
        __typename: 'Post',
        id: 'ck8jwai7u0dh30198hn5n94ff',
        createdAt: '2020-04-03T07:57:15.000Z',
        title: 'aaa',
      },
      {
        votes: 2,
        url: 'https://sing',
        __typename: 'Post',
        id: 'ck8jwa2ff0did0171xl8eqasp',
        createdAt: '2020-04-03T07:56:55.000Z',
        title: 'aa',
      },
      {
        votes: 15,
        url: 'https://google.com',
        __typename: 'Post',
        id: 'ck8j1qtbn16sy012064l9s5jy',
        createdAt: '2020-04-02T17:42:08.000Z',
        title: 'test',
      },
      {
        votes: 10,
        url: 'https://flatlay.io/',
        __typename: 'Post',
        id: 'ck8ivm53k1siy01745ah8aczp',
        createdAt: '2020-04-02T14:50:33.000Z',
        title: 'ddcsc',
      },
      {
        votes: 3,
        url: 'https://d',
        __typename: 'Post',
        id: 'ck8iqmkjx0pkk0101j0w6shje',
        createdAt: '2020-04-02T12:30:54.000Z',
        title: 'd',
      },
    ],
    _allPostsMeta: {
      count: 10,
      __typename: '_QueryMeta',
    },
  },
}

export const resolvers = {
  Query: {
    allPosts(_parent, _args, _context, _info) {
      return blah.data.allPosts
    },
    _allPostsMeta() {
      return blah.data._allPostsMeta
    },
  },
}
