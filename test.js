
import fs from 'fs'; import {authenticator as otp} from 'otplib';
let OtpSecret=fs.readFileSync('otpkey');

console.log("Generating OTP token...");
console.log(otp.generate(OtpSecret));