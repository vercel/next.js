// All these funtions are meant to be added in the FUNCTIONS section of the Fauna Dashboard
// create_user
// Query(
//   Lambda(
//     ['input'],
//     Create(Collection('User'), {
//       data: {
//         email: Select('email', Var('input')),
//         role: Select('role', Var('input')),
//       },
//       credentials: { password: Select('password', Var('input')) },
//     })
//   )
// );

// login_user
// Query(
//   Lambda(
//     ['input'],
//     Select(
//       'secret',
//       Login(Match(Index('unique_User_email'), Select('email', Var('input'))), {
//         password: Select('password', Var('input')),
//         ttl: TimeAdd(Now(), 14, 'days'),
//       })
//     )
//   )
// );

// logout_user
// Query(Lambda('_', Logout(true)));

// signup_user;
// Query(
//   Lambda(
//     ['input'],
//     Do(
//       Call(Function('create_user'), Var('input')),
//       Call(Function('login_user'), Var('input'))
//     )
//   )
// );

// validate_token
// Query(Lambda(['token'], Not(IsNull(KeyFromSecret(Var('token'))))));
