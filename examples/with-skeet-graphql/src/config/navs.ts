import {
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  Cog8ToothIcon,
  HeartIcon,
  HomeIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline'

export const defaultMainNav = [
  {
    name: 'navs.defaultMainNav.news',
    href: '/news/',
  },
  {
    name: 'navs.defaultMainNav.doc',
    href: '/doc/',
  },
]

export const commonFooterNav = [
  {
    name: 'navs.commonFooterNav.news',
    href: '/news/',
  },
  {
    name: 'navs.commonFooterNav.doc',
    href: '/doc/',
  },
  {
    name: 'navs.commonFooterNav.privacy',
    href: '/legal/privacy-policy/',
  },
]

export const docMenuNav = [
  { name: 'doc:menuNav.home', href: '/doc/', icon: HomeIcon },
  {
    name: 'doc:menuNav.general.groupTitle',
    children: [
      {
        name: 'doc:menuNav.general.motivation',
        href: '/doc/general/motivation/',
        icon: HeartIcon,
      },
      {
        name: 'doc:menuNav.general.quickstart',
        href: '/doc/general/quickstart/',
        icon: RocketLaunchIcon,
      },
      {
        name: 'doc:menuNav.general.readme',
        href: '/doc/general/readme/',
        icon: BookOpenIcon,
      },
    ],
  },
]

export const docHeaderNav = [
  {
    name: 'doc:headerNav.home',
    href: '/',
  },
  {
    name: 'doc:headerNav.news',
    href: '/news/',
  },
]

export const userMenuNav = [
  {
    name: 'user:menuNav.chat',
    href: '/user/chat/',
    icon: ChatBubbleLeftRightIcon,
  },
  {
    name: 'user:menuNav.settings',
    href: '/user/settings/',
    icon: Cog8ToothIcon,
  },
]

export const userHeaderNav = [
  {
    name: 'user:headerNav.settings',
    href: '/user/settings/',
  },
]
