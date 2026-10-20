const initPolyfills = () => {
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (str: string | RegExp, newStr: any) {
      if (Object.prototype.toString.call(str).toLowerCase() === '[object regexp]') {
        return this.replace(str, newStr)
      }
      return this.replace(new RegExp(str, 'g'), newStr)
    }
  }
}

export default initPolyfills
