/* Variable declaration statement. All the parameters that can be
adjusted on the right side can be adjusted in the following statement. */

// The value range of the parameter newPatternLength ranges from 1 to 32,
// and preferably be a multiple of 4. The value range of the parameter
// newTempo ranges from 20 to 240, and preferably be an integer.
// The value range of the parameter newTempo ranges from 0.5 to 0.7.
// The value range of the parameter newTemperature ranges from 0 to
// positive infinity, and must be a positive.
var newPatternLength = 16;
var newTempo = 140;
var newSwing = 0.6;
var newTemperature = 1.5;
var newSeed = [[0],[1,2],[5],[8]];

/* Reset the contents of the above variables, the definition of the
setting method is at the backend, the code is not shown here. */
setPatternLength(newPatternLength);
setTempo(newTempo);
setSwing(newSwing);
setTemperature(newTemperature);
setSeed(newSeed);

/* The regenerate function determines the rendering of the page. After this,
the neural network will regenerate a melody and play durms according to the
above parameters. */
regenerate().then(() => {
	if (!hasBeenStarted) {
		Tone.context.resume();
		Tone.Transport.start();
		hasBeenStarted = true;
	}
	if (Tone.Transport.state === 'started') {
		setTimeout(startPattern, 0);
	}
});
