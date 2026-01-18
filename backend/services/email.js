const sendVerifictionCode = async (email, code) => {
    console.log('==========================================');
    console.log(`EMAIL TO: ${email}`);
    console.log(`VERIFICATION CODE: ${code}`);
    console.log('==========================================');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return true;
};

export default sendVerifictionCode;