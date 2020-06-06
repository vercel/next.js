// All these roles are meant to be added through the SHELL section of the Fauna Dashboard
// fnc_role_create_user role
// CreateRole({
//   name: 'fnc_role_create_user',
//   privileges: [
//     {
//       resource: Collection('User'),
//       actions: {
//         read: true,
//         create: Query(
//           Lambda(
//             'values',
//             Equals(Select(['data', 'role'], Var('values')), 'FREE_USER')
//           )
//         ),
//       },
//     },
//   ],
// });

// fnc_role_login_user role
// CreateRole({
//   name: 'fnc_role_login_user',
//   privileges: [
//     {
//       resource: Index('unique_User_email'),
//       actions: {
//         unrestricted_read: true,
//       },
//     },
//   ],
// });

// fnc_role_logout_user role
// CreateRole({
//   name: 'fnc_role_logout_user',
//   privileges: [
//     {
//       resource: Ref('tokens'),
//       actions: {
//         create: true,
//         read: true,
//       },
//     },
//   ],
// });

// fnc_role_signup_user role
// CreateRole({
//   name: 'fnc_role_signup_user',
//   privileges: [
//     {
//       resource: Function('create_user'),
//       actions: {
//         call: true,
//       },
//     },
//     {
//       resource: Function('login_user'),
//       actions: {
//         call: true,
//       },
//     },
//   ],
// });

// fnc_role_validate_token role
// CreateRole({
//   name: 'fnc_role_validate_token',
//   privileges: [
//     {
//       resource: Ref('tokens'),
//       actions: {
//         read: true,
//       },
//     },
//   ],
// });

// free_user role
// CreateRole({
//   name: 'free_user',
//   privileges: [
//     {
//       resource: Collection('User'),
//       actions: {
//         read: Query(Lambda('userRef', Equals(Identity(), Var('userRef')))),
//         write: Query(
//           Lambda(
//             ['_', 'newData', 'userRef'],
//             And(
//               Equals(Identity(), Var('userRef')),
//               Equals('FREE_USER', Select(['data', 'role'], Var('newData')))
//             )
//           )
//         ),
//       },
//     },
//     {
//       resource: Function('validate_token'),
//       actions: {
//         call: true,
//       },
//     },
//     {
//       resource: Function('logout_user'),
//       actions: {
//         call: true,
//       },
//     },
//   ],
//   membership: [
//     {
//       resource: Collection('User'),
//       predicate: Query(
//         Lambda(
//           'userRef',
//           Or(Equals(Select(['data', 'role'], Get(Var('userRef'))), 'FREE_USER'))
//         )
//       ),
//     },
//   ],
// });

// public role
// CreateRole({
//   name: 'public',
//   privileges: [
//     {
//       resource: Function('signup_user'),
//       actions: {
//         call: true,
//       },
//     },
//     {
//       resource: Function('login_user'),
//       actions: {
//         call: true,
//       },
//     },
//   ],
// });
