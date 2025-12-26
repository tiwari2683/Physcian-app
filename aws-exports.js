const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: "us-east-1_nxn7JWpsM",
      userPoolClientId: "1p6homv71i3l5mdog70c5t41jk",
      signUpVerificationMethod: "code",
      loginWith: {
        oauth: {
          domain: "us-east-12donwwm43.auth.us-east-1.amazoncognito.com",
          scopes: [
            "email",
            "profile",
            "openid",
            "aws.cognito.signin.user.admin",
          ],
          redirectSignIn: ["com.physicianapp.app://"],
          redirectSignOut: ["com.physicianapp.app://"],
          responseType: "code",
          providers: ["Google"],
        },
      },
    },
  },
};

export default awsConfig;
