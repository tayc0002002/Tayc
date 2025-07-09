module.exports = [
    {
        command: ["vcf"],
        desc: "Remove duplicated contact",
        operate: async ({ Tayc, reply, quoted }) => {
            console.log(quoted?.vcf);

        }

    }
]